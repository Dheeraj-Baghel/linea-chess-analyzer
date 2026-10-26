import { Chess } from 'chess.js';
import { LocalEngine } from './engine.js';
import { ENGINE_BUILD } from './engineBuild.js';
import { uciMove } from './chess.js';
import { DEFAULT_REVIEW_QUALITY, REVIEW_ACCURACY_VERSION, REVIEW_CLASSIFIER_VERSION, REVIEW_POLICIES, reviewGamePayload, reviewGameSignature } from './reviewPolicy.js';
import { evaluateReviewPosition, verifyReviewMove, scoreReviewMove } from './moveReview.js';
import { bookMoveEvidence } from './reviewBook.js';
import { validateReviewCheckpoint } from './reviewCheckpoint.js';

// Phase 4: one App-owned review session. Presentation/pending quality changes
// cannot launch jobs. Every async write must match both generation AND attempt;
// late hash/search/error callbacks from cancellation are never accepted.
export function createReviewSession({
  createEngine = () => new LocalEngine(),
  signature = reviewGameSignature,
  id = () => crypto.randomUUID(),
  timestamp = () => new Date().toISOString(),
  elapsedTime = () => performance.now(),
} = {}) {
  let state = { gameId: null, total: 0, selectedQuality: DEFAULT_REVIEW_QUALITY, records: {}, positions: {}, acceptances: {}, rechecks: {}, generation: null, running: false, stage: '', error: '', done: 0 };
  let currentGame = null, payload = '', engine = null, attempt = null, disposed = false, restoreEpoch = 0;
  const listeners = new Set();
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; for (const listener of listeners) listener(); } };
  const updateGeneration = patch => ({ ...state.generation, ...patch, updatedAt: timestamp() });
  const invalidate = ({ disposeEngine = false } = {}) => {
    restoreEpoch++;
    const previous = attempt; attempt = null;
    previous?.controller.abort();
    engine?.cancel?.();
    if (disposeEngine) { engine?.dispose(); engine = null; }
  };
  const canResume = () => Boolean(currentGame?.moves.length && state.generation && state.generation.policy.id === state.selectedQuality && state.done < state.total && !state.running);

  const launch = async fresh => {
    if (disposed || !currentGame?.moves.length) return;
    if (!fresh && state.running) return;
    if (!fresh && state.generation && state.generation.policy.id === state.selectedQuality && state.done === state.total) return;
    const newGeneration = fresh || !state.generation || state.generation.policy.id !== state.selectedQuality;
    invalidate({ disposeEngine: newGeneration });
    const game = currentGame, sourcePayload = payload;
    const policy = REVIEW_POLICIES[state.selectedQuality];
    if (newGeneration) {
      const createdAt = timestamp();
      emit({ records: {}, positions: {}, acceptances: {}, rechecks: {}, done: 0, generation: {
        id: id(), game: { id: game.id, signature: null, signatureAlgorithm: 'SHA-256', initialFen: game.initialFen, plies: game.moves.length, white: game.headers.White || 'White', black: game.headers.Black || 'Black', provider: game.source?.provider || null, providerGameId: game.source?.id || null },
        engine: Object.freeze({ ...ENGINE_BUILD }), policy: Object.freeze({ ...policy }), classifierVersion: REVIEW_CLASSIFIER_VERSION, accuracyVersion: REVIEW_ACCURACY_VERSION,
        createdAt, updatedAt: createdAt, completedAt: null, pausedAt: null, resumedAt: null, resumeCount: 0, status: 'preparing',
        coverage: { reviewed: 0, total: game.moves.length, unreviewed: game.moves.length, complete: false },
      } });
    } else {
      emit({ generation: updateGeneration({ status: 'running', resumedAt: timestamp(), resumeCount: state.generation.resumeCount + 1 }) });
    }
    const generationId = state.generation.id;
    const job = { generationId, controller: new AbortController() }; attempt = job;
    const active = () => !disposed && attempt === job && state.generation?.id === generationId && state.gameId === game.id && payload === sourcePayload && !job.controller.signal.aborted;
    const assertActive = () => { if (!active()) throw new DOMException('Obsolete review attempt', 'AbortError'); };
    emit({ running: true, error: '', stage: 'Loading review engine…' });
    try {
      if (!state.generation.game.signature) {
        const digest = await signature(sourcePayload); assertActive();
        emit({ generation: updateGeneration({ game: { ...state.generation.game, signature: digest }, status: 'running' }) });
      }
      if (!engine || engine.closed || engine.fatal) { engine?.dispose(); engine = createEngine(); }
      const worker = engine;
      await worker.ready; assertActive();
      const chess = new Chess(game.initialFen);
      for (const move of game.moves.slice(0, state.done)) chess.move(uciMove(move.uci));
      const book = await bookMoveEvidence(game); assertActive();

      const evaluate = async (board, ply, kind, position) => {
        assertActive();
        const cached = kind === 'position' ? state.positions[ply] : state.acceptances[ply];
        if (cached) return cached;
        const evaluated = await evaluateReviewPosition({ board, position, worker, policy, kind, signal: job.controller.signal, assertActive, timestamp, elapsedTime });
        const evaluation = { ...evaluated, generationId, ply, phase: kind };
        assertActive();
        if (kind === 'position') emit({ positions: { ...state.positions, [ply]: evaluation }, generation: updateGeneration({}) });
        else emit({ acceptances: { ...state.acceptances, [ply]: evaluation }, generation: updateGeneration({}) });
        return evaluation;
      };
      const positionAt = ply => `position fen ${game.initialFen}${ply ? ` moves ${game.moves.slice(0, ply).map(move => move.uci).join(' ')}` : ''}`;
      const recheck = async (ply, move, before, after) => {
        if (state.rechecks[ply]) return state.rechecks[ply];
        const evidence = await verifyReviewMove({ move, before, after, previous: state.records[ply - 1], position: positionAt(ply - 1), worker, policy, signal: job.controller.signal, assertActive, timestamp, elapsedTime, onVerify: () => emit({ stage: `Verifying disputed move ${ply} of ${game.moves.length}…` }) });
        assertActive();
        if (evidence) emit({ rechecks: { ...state.rechecks, [ply]: evidence } });
        return evidence;
      };
      let before = await evaluate(chess, state.done, 'position', positionAt(state.done));
      for (let index = state.done; index < game.moves.length; index++) {
        assertActive();
        const ply = index + 1, move = game.moves[index];
        emit({ stage: `Reviewing move ${ply} of ${game.moves.length}…` });
        chess.move(uciMove(move.uci));
        const after = await evaluate(chess, ply, 'position', positionAt(ply)); assertActive();
        const verification = await recheck(ply, move, before, after); assertActive();
        const scored = await scoreReviewMove({ move, before, after, previous: state.records[ply - 1], verification, book, ply, evaluateAcceptance: async candidate => {
          emit({ stage: `Checking a possible brilliant sacrifice at ${move.number}${move.color === 'w' ? '.' : '…'} ${move.san}…` });
          const capture = new Chess(game.initialFen);
          for (const original of game.moves.slice(0, ply)) capture.move(uciMove(original.uci));
          capture.move(uciMove(candidate.acceptance));
          return evaluate(capture, ply, 'sacrifice', `${positionAt(ply)} ${candidate.acceptance}`);
        } });
        assertActive();
        const provenance = Object.freeze({
          generationId, gameId: game.id, gameSignature: state.generation.game.signature,
          engine: state.generation.engine, policy: state.generation.policy,
          classifierVersion: REVIEW_CLASSIFIER_VERSION, accuracyVersion: REVIEW_ACCURACY_VERSION,
          reviewedAt: timestamp(), ply, color: move.color, uci: move.uci, san: move.san,
        });
        const record = { ...scored, provenance };
        emit({ records: { ...state.records, [ply]: record }, done: ply, generation: updateGeneration({ status: 'running', coverage: { reviewed: ply, total: game.moves.length, unreviewed: game.moves.length - ply, complete: ply === game.moves.length } }) });
        before = after;
      }
      assertActive();
      emit({ running: false, stage: '', generation: updateGeneration({ status: 'completed', completedAt: timestamp() }) });
    } catch (error) {
      if (active() && error.name !== 'AbortError') {
        engine?.dispose(); engine = null;
        emit({ running: false, stage: '', error: error.message || 'Review failed. Resume or rerun it.', generation: updateGeneration({ status: 'error' }) });
      }
    } finally { if (attempt === job) { attempt = null; engine?.cancel?.(); if (state.running) emit({ running: false, stage: '' }); } }
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setGame(game) {
      const nextPayload = reviewGamePayload(game);
      if (currentGame?.id === game.id && payload === nextPayload) return;
      invalidate({ disposeEngine: true });
      currentGame = { ...game, headers: { ...game.headers }, moves: game.moves.map(move => ({ ...move })) }; payload = nextPayload;
      emit({ gameId: game.id, total: game.moves.length, records: {}, positions: {}, acceptances: {}, rechecks: {}, generation: null, running: false, stage: '', error: '', done: 0 });
    },
    setQuality(quality) {
      if (!Object.hasOwn(REVIEW_POLICIES, quality)) throw new Error('Unknown game-review quality.');
      if (state.selectedQuality !== quality) emit({ selectedQuality: quality });
    },
    async restore(snapshot) {
      if (disposed || state.running || !currentGame) return false;
      invalidate({ disposeEngine: true });
      const epoch = restoreEpoch, game = currentGame, sourcePayload = payload;
      const digest = await signature(sourcePayload);
      if (disposed || restoreEpoch !== epoch || currentGame !== game || payload !== sourcePayload || !validateReviewCheckpoint(game, snapshot, digest)) return false;
      // The last completed move can commit just before the final status write.
      // Valid full evidence is finished work, not a permanently unresumable pause.
      const saved = structuredClone(snapshot), complete = saved.done === game.moves.length;
      emit({ ...saved, gameId: game.id, selectedQuality: saved.generation.policy.id, running: false, error: '', stage: complete ? '' : 'Saved checkpoint. Resume to continue.', generation: { ...saved.generation, engine: Object.freeze({ ...saved.generation.engine }), policy: Object.freeze({ ...saved.generation.policy }), status: complete ? 'completed' : 'paused', completedAt: complete ? saved.generation.completedAt || timestamp() : null, restoredAt: timestamp(), updatedAt: timestamp() } });
      return true;
    },
    start: () => launch(false),
    rerun: () => launch(true),
    resume: () => canResume() ? launch(false) : Promise.resolve(),
    stop() {
      if (!state.running) return;
      invalidate();
      emit({ running: false, stage: '', generation: updateGeneration({ status: 'paused', pausedAt: timestamp() }) });
    },
    canResume,
    dispose() { invalidate({ disposeEngine: true }); disposed = true; listeners.clear(); },
  };
}
