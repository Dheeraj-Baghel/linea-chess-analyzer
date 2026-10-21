import { parseGame } from './chess.js';
import { createReviewSession } from './reviewSession.js';
import { reviewGamePayload, reviewGameSignature, REVIEW_POLICIES, REVIEW_ACCURACY_VERSION, REVIEW_CLASSIFIER_VERSION } from './reviewPolicy.js';
import { ENGINE_BUILD } from './engineBuild.js';
import { snapshotCompatible } from './library.js';
import { validateReviewCheckpoint } from './reviewCheckpoint.js';
import { buildPlayerReport } from './playerReport.js';
import { loadOpeningIndex, detectOpening } from './openings.js';
import { eligibleBrowserRow } from './gameBrowser.js';

// A frozen batch owns up to ten immutable source games. Results are saved per
// game; a foreground review can preempt only through the shared coordinator.
export function createBatchReview({ library, coordinator, createSession = createReviewSession, id = () => crypto.randomUUID(), now = () => new Date().toISOString() }) {
  let state = { manifest: null, running: false, progress: null, report: null, error: '', storageError: '' };
  let epoch = 0, current = null, runPromise = null, disposed = false, starting = false, preparationCancelled = false, preparationDone = null, checkpointWrites = Promise.resolve();
  const listeners = new Set();
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; for (const listener of listeners) listener(); } };
  const save = async manifest => {
    const frozen = structuredClone(manifest), report = buildPlayerReport(frozen);
    emit({ manifest: { ...manifest }, report });
    try {
      await library.put('batches', frozen);
      await library.put('reports', { key: manifest.key, gameKeys: manifest.selectedGames.map(item => item.key), manifest: frozen, value: report, updatedAt: now() });
      emit({ storageError: '' });
    } catch (error) { emit({ storageError: `Local report save failed: ${error.message}. Completed in-memory evidence is retained; export it before leaving.` }); }
  };
  const run = async () => {
    if (!state.manifest || state.running || disposed) return;
    const token = ++epoch, manifest = state.manifest;
    const active = () => !disposed && token === epoch && state.manifest?.key === manifest.key;
    manifest.status = 'running'; emit({ running: true, error: '' });
    for (let index = 0; index < manifest.selectedGames.length; index++) {
      if (!active()) return;
      const item = manifest.selectedGames[index];
      if (['completed', 'provisional', 'failed', 'skipped'].includes(item.status)) continue;
      let session = null, unsubscribe = null;
      try {
        const game = parseGame(item.pgn);
        const storedGame = await library.getGame?.(item.key);
        if (library.getGame && (!storedGame || storedGame.signature !== item.signature)) throw new Error('The local source game was deleted or changed. This frozen game was skipped.');
        if (await reviewGameSignature(reviewGamePayload(game)) !== item.signature) throw new Error('Saved game content no longer matches its frozen signature.');
        if (!active()) return;
        session = createSession({ createEngine: () => coordinator.createClient('batch', reason => { controller.pause(reason === 'hidden' ? 'Browser work paused while the page was hidden. Resume explicitly.' : 'Paused for foreground analysis. Return here and Resume batch explicitly.'); }) });
        current = session; session.setGame(game); session.setQuality(manifest.quality);
        const saved = await library.getReview(item.key, item.signature, manifest.quality);
        if (!active()) return;
        if (saved) await session.restore(saved.snapshot);
        if (!active()) return;
        item.status = 'running';
        unsubscribe = session.subscribe(() => {
          if (!active()) return;
          const snapshot = session.getSnapshot();
          emit({ progress: { game: index + 1, total: manifest.selectedGames.length, ply: snapshot.done, plies: game.moves.length, stage: snapshot.stage } });
          if (!snapshot.generation?.game.signature) return;
          const value = structuredClone(snapshot);
          checkpointWrites = checkpointWrites.catch(() => {}).then(() => library.saveCheckpoint(item.key, item.signature, value)).catch(error => emit({ storageError: `Checkpoint save failed: ${error.message}. Current evidence is still in memory.` }));
        });
        await session.start();
        const snapshot = structuredClone(session.getSnapshot());
        await checkpointWrites;
        if (!active()) return;
        if (snapshot.error || snapshot.done !== game.moves.length) throw new Error(snapshot.error || 'Review ended before complete coverage. Resume this game separately.');
        item.snapshot = snapshot;
        const one = buildPlayerReport({ ...manifest, selectedGames: [item] }); item.status = one.completed ? 'completed' : 'provisional';
        item.error = ''; manifest.updatedAt = now(); await save(manifest);
      } catch (error) {
        if (!active()) return;
        item.status = 'failed'; item.error = error.message;
        if (session?.getSnapshot().generation) item.snapshot = structuredClone(session.getSnapshot());
        await save(manifest);
      } finally { unsubscribe?.(); session?.dispose(); if (current === session) current = null; }
    }
    if (!active()) return;
    manifest.status = manifest.selectedGames.some(item => ['failed', 'skipped'].includes(item.status)) ? 'completed-with-skips' : 'completed';
    manifest.completedAt = now(); manifest.updatedAt = now(); emit({ running: false, progress: null }); await save(manifest);
  };
  const controller = {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => state,
    async start(sample, { quality = 'balanced' } = {}) {
      if (starting) throw new Error('This batch selection is already being prepared.');
      starting = true; preparationCancelled = false;
      let finishPreparation; preparationDone = new Promise(resolve => { finishPreparation = resolve; });
      try {
      if (!REVIEW_POLICIES[quality]) throw new Error('Unknown batch quality.');
      const chosen = structuredClone(sample);
      if (!chosen.games.length || chosen.games.length > 10 || new Set(chosen.games.map(game => game.key)).size !== chosen.games.length) throw new Error('Choose between 1 and 10 different eligible games.');
      if (chosen.games.some(row => !eligibleBrowserRow(row, chosen.filter))) throw new Error('The frozen sample contains an ineligible or unidentified-player game.');
      await this.pause('', false);
      const assertPreparation = () => { if (preparationCancelled || disposed) throw new DOMException('Batch preparation cancelled', 'AbortError'); };
      let openingIndex = null; try { openingIndex = await loadOpeningIndex(); } catch { /* Opening data can remain unavailable without blocking native review. */ }
      assertPreparation();
      const selectedGames = [];
      for (const row of chosen.games) {
        const game = { ...parseGame(row.pgn), source: { provider: row.provider, id: row.id, url: row.url, username: chosen.username, color: row.color, autoReview: false } };
        const record = await library.saveGame(game);
        assertPreparation();
        selectedGames.push({ ...row, key: record.key, signature: record.signature, status: 'queued', snapshot: null, error: '', opening: detectOpening(game, openingIndex) });
      }
      const manifest = { key: id(), provider: chosen.provider, username: chosen.username, filter: chosen.filter, fetchedAt: chosen.fetchedAt, quality, reviewVersions: { engine: { ...ENGINE_BUILD }, accuracy: REVIEW_ACCURACY_VERSION, classifier: REVIEW_CLASSIFIER_VERSION, policy: { ...REVIEW_POLICIES[quality] } }, selectedGames, gameKeys: selectedGames.map(game => game.key), importedCount: chosen.games.length, status: 'queued', createdAt: now(), updatedAt: now() };
      // The manifest must save before a browser-only multi-game job starts.
      await library.put('batches', structuredClone(manifest));
      assertPreparation();
      emit({ manifest, report: buildPlayerReport(manifest), error: '', storageError: '' });
      runPromise = run(); runPromise.catch(error => emit({ running: false, error: error.message })); return manifest.key;
      } finally { starting = false; finishPreparation(); preparationDone = null; }
    },
    async pause(message = 'Batch paused. Completed checkpoints are retained.', waitForPreparation = true) {
      if (waitForPreparation && starting) preparationCancelled = true;
      epoch++; current?.stop();
      const manifest = state.manifest;
      if (manifest && state.running) {
        const activeItem = manifest.selectedGames.find(item => item.status === 'running');
        if (current && activeItem) {
          const item = activeItem, snapshot = current.getSnapshot();
          if (item && snapshot.generation?.game.signature) item.snapshot = structuredClone(snapshot);
        }
        manifest.status = 'paused'; manifest.updatedAt = now();
        for (const item of manifest.selectedGames) if (item.status === 'running') item.status = 'paused';
        emit({ running: false, error: '', progress: null, storageError: state.storageError });
        if (message) emit({ error: message });
      }
      await runPromise?.catch(() => {}); await checkpointWrites.catch(() => {});
      if (waitForPreparation) await preparationDone;
      if (manifest && manifest.status === 'paused') await save(manifest);
    },
    resume() {
      const manifest = state.manifest;
      if (!manifest || state.running || ['completed', 'completed-with-skips', 'cancelled'].includes(manifest.status)) return;
      if (manifest.selectedGames.some(item => item.status === 'stale') || manifest.reviewVersions.accuracy !== REVIEW_ACCURACY_VERSION || manifest.reviewVersions.classifier !== REVIEW_CLASSIFIER_VERSION || manifest.reviewVersions.engine.wasmSha256 !== ENGINE_BUILD.wasmSha256 || JSON.stringify(manifest.reviewVersions.policy) !== JSON.stringify(REVIEW_POLICIES[manifest.quality])) { emit({ error: 'This batch uses an older review identity. Its evidence is retained; create a new explicitly selected batch to reanalyze.' }); return; }
      runPromise = run(); runPromise.catch(error => emit({ running: false, error: error.message }));
    },
    async cancel() {
      await this.pause(''); const manifest = state.manifest; if (!manifest) return;
      manifest.status = 'cancelled'; for (const item of manifest.selectedGames) if (['queued', 'running', 'paused'].includes(item.status)) item.status = 'skipped';
      emit({ running: false, error: 'Batch cancelled. Completed games remain saved; unreviewed games are skipped.' }); await save(manifest);
    },
    async restore(key) {
      if (state.manifest?.key === key) return;
      await this.pause('');
      const manifest = await library.read('batches', key);
      if (!manifest?.selectedGames?.length || manifest.selectedGames.length > 10) { emit({ manifest: null, report: null, error: 'This saved report was deleted or is unavailable in this browser.' }); return; }
      for (const item of manifest.selectedGames) {
        const game = parseGame(item.pgn);
        if (!['w', 'b'].includes(item.color) || await reviewGameSignature(reviewGamePayload(game)) !== item.signature) throw new Error('Saved report content validation failed. Current work was not replaced.');
        if (item.snapshot && (!snapshotCompatible(item.signature, item.snapshot, manifest.quality) || !validateReviewCheckpoint(game, item.snapshot, item.signature))) item.status = 'stale';
        if (item.status === 'running') item.status = 'paused';
      }
      if (['queued', 'running'].includes(manifest.status)) manifest.status = 'paused';
      emit({ manifest, running: false, progress: null, report: buildPlayerReport(manifest), error: manifest.status === 'paused' ? 'Interrupted browser work is paused. Resume batch explicitly.' : '', storageError: '' });
    },
    async list() { return (await library.all('batches')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    forget() { epoch++; current?.stop(); emit({ manifest: null, report: null, running: false, progress: null, error: 'This report was removed with its local source data.' }); },
    dispose() { epoch++; preparationCancelled = true; current?.stop(); current?.dispose(); disposed = true; listeners.clear(); },
  };
  return controller;
}
