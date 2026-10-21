import { parseGame, gameFromFen } from './chess.js';
import { ENGINE_BUILD } from './engineBuild.js';
import { REVIEW_POLICIES, REVIEW_ACCURACY_VERSION, REVIEW_CLASSIFIER_VERSION, reviewGamePayload, reviewGameSignature } from './reviewPolicy.js';
import { accuracySummary } from './accuracy.js';

// Browser/device-local data only. Never clear the origin or another app's stores.
export const LIBRARY_DATABASE = 'linea-library';
export const LIBRARY_SCHEMA = 1;
const STORES = ['games', 'reviews', 'drafts', 'accounts', 'batches', 'reports', 'meta'];
export function reviewIdentity(signature, quality) {
  const policy = REVIEW_POLICIES[quality];
  if (!signature || !policy) throw new Error('A game signature and known policy are required.');
  return JSON.stringify({ signature, worker: ENGINE_BUILD.workerSha256, wasm: ENGINE_BUILD.wasmSha256, policy, accuracy: REVIEW_ACCURACY_VERSION, classifier: REVIEW_CLASSIFIER_VERSION });
}
export function snapshotCompatible(signature, snapshot, quality) {
  const generation = snapshot?.generation;
  return Boolean(generation && generation.game?.signature === signature && generation.engine?.workerSha256 === ENGINE_BUILD.workerSha256 && generation.engine?.wasmSha256 === ENGINE_BUILD.wasmSha256 && generation.accuracyVersion === REVIEW_ACCURACY_VERSION && generation.classifierVersion === REVIEW_CLASSIFIER_VERSION && JSON.stringify(generation.policy) === JSON.stringify(REVIEW_POLICIES[quality]));
}
export function gameFromSaved(record) {
  const parsed = record.kind === 'position' ? gameFromFen(record.initialFen) : parseGame(record.originalPgn);
  return { ...parsed, source: record.source, isSample: Boolean(record.isSample), localKey: record.key, contentSignature: record.signature };
}

// Native transaction events, not request success, establish a completed write.
// There are no unrelated awaits inside an active IndexedDB transaction.
export function createLibrary({ indexedDB = globalThis.indexedDB, name = LIBRARY_DATABASE, schemaVersion = LIBRARY_SCHEMA, now = () => new Date().toISOString() } = {}) {
  let connection = null, opening = null, closed = false, failure = '';
  const listeners = new Set();
  const announce = (kind, error = '') => { failure = error; for (const listener of listeners) listener({ kind, error }); };
  const open = () => {
    if (closed) return Promise.reject(new Error('Local library is closed.'));
    if (connection) return Promise.resolve(connection);
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!indexedDB) { reject(new Error('Local saving is unavailable in this browser. Your current work stays in memory.')); return; }
      let request, settled = false;
      const fail = error => { if (!settled) { settled = true; reject(error); } };
      try { request = indexedDB.open(name, schemaVersion); } catch (error) { fail(error); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'key' });
      };
      request.onblocked = () => fail(new Error('Local library upgrade is blocked by another Linea tab. Close it and retry.'));
      request.onerror = () => fail(request.error || new Error('Cannot open the local library.'));
      request.onsuccess = () => {
        if (settled || closed) { request.result.close(); return; }
        settled = true; connection = request.result;
        connection.onversionchange = () => { connection.close(); connection = null; opening = null; announce('error', 'The local library changed in another tab. Retry saving after that update.'); };
        resolve(connection);
      };
    }).catch(error => { opening = null; announce('error', error.message); throw error; });
    return opening;
  };
  const transaction = async (stores, mode, action) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      let tx, result, failed = false;
      const fail = error => { if (!failed) { failed = true; announce('error', error?.message || 'Local save failed. Current work is still in memory.'); reject(error || new Error('Local transaction failed.')); } };
      try {
        tx = db.transaction(stores, mode);
        tx.oncomplete = () => { if (!failed) resolve(typeof result === 'function' ? result() : result); };
        tx.onabort = () => fail(tx.error || new Error('Local save was aborted. Storage may be full; export your current work.'));
        tx.onerror = () => {}; // Abort is the final transaction outcome.
        const guard = callback => (...args) => { try { callback(...args); } catch (error) { fail(error); try { tx.abort(); } catch { /* Already inactive. */ } } };
        result = action(tx, guard);
      } catch (error) { try { tx?.abort(); } catch { /* Already inactive. */ } fail(error); }
    });
  };
  const read = (store, key) => transaction([store], 'readonly', tx => { const request = tx.objectStore(store).get(key); return () => request.result ?? null; });
  const all = store => transaction([store], 'readonly', tx => { const request = tx.objectStore(store).getAll(); return () => request.result; });
  const put = async (store, value) => { await transaction([store], 'readwrite', tx => tx.objectStore(store).put(value)); announce(store); return value; };
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getError: () => failure,
    ready: open,
    retry() { opening = null; return open(); },
    read, all, put,
    async saveGame(game) {
      const signature = await reviewGameSignature(reviewGamePayload(game));
      const source = game.source;
      const providerKey = source?.provider && source?.id ? `${source.provider}:${source.provider === 'chess.com' ? source.url?.includes('/daily/') ? 'daily:' : 'live:' : ''}${source.id}` : null;
      const key = providerKey || `local:${signature}`;
      const record = { key, signature, kind: game.moves.length ? 'game' : 'position', originalPgn: game.rawPgn, initialFen: game.initialFen, source, isSample: game.isSample, players: { w: game.headers.White || 'White', b: game.headers.Black || 'Black' }, result: game.headers.Result || '*', plies: game.moves.length, importedAt: now(), lastOpenedAt: now() };
      await transaction(['games'], 'readwrite', (tx, guard) => {
        const store = tx.objectStore('games'), previous = store.get(key);
        previous.onsuccess = guard(() => store.put({ ...record, importedAt: previous.result?.importedAt || record.importedAt }));
      });
      announce('games'); return record;
    },
    getGame: key => read('games', key),
    async listGames() { return (await all('games')).sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)); },
    async saveCheckpoint(key, signature, snapshot) {
      const quality = snapshot.generation?.policy.id;
      if (!snapshotCompatible(signature, snapshot, quality)) return false;
      const identity = reviewIdentity(signature, quality);
      const value = { key: `${key}\n${identity}`, gameKey: key, signature, identity, updatedAt: now(), snapshot: { ...structuredClone(snapshot), selectedQuality: quality } };
      let saved = false;
      await transaction(['games', 'reviews'], 'readwrite', (tx, guard) => {
        const game = tx.objectStore('games').get(key);
        game.onsuccess = guard(() => { if (game.result?.signature === signature) { tx.objectStore('reviews').put(value); saved = true; } });
      });
      if (saved) announce('checkpoint'); return saved;
    },
    async getReview(key, signature, quality) {
      const value = await read('reviews', `${key}\n${reviewIdentity(signature, quality)}`);
      if (!snapshotCompatible(signature, value?.snapshot, quality)) return null;
      return value;
    },
    async reviewState(key, signature, quality) {
      const value = await this.getReview(key, signature, quality);
      if (value) {
        const record = await this.getGame(key);
        if (!record) return { kind: 'new', review: null };
        const game = gameFromSaved(record);
        const ready = value.snapshot.generation.status === 'completed' && accuracySummary(game, value.snapshot.records, value.snapshot.generation.id).complete;
        return { kind: ready ? 'complete' : value.snapshot.generation.status === 'completed' ? 'provisional' : 'paused', review: value };
      }
      const records = (await all('reviews')).filter(value => value.gameKey === key);
      return { kind: records.length ? 'stale' : 'new', review: null };
    },
    async saveDraft(key, signature, draft) {
      let saved = false;
      await transaction(['games', 'drafts', 'meta'], 'readwrite', (tx, guard) => {
        const game = tx.objectStore('games').get(key);
        game.onsuccess = guard(() => {
          if (game.result?.signature !== signature) return;
          tx.objectStore('drafts').put({ key, signature, value: draft, updatedAt: now() });
          tx.objectStore('meta').put({ key: 'last-workspace', gameKey: key }); saved = true;
        });
      });
      return saved;
    },
    async deleteGame(key) {
      await transaction(['games', 'reviews', 'drafts', 'batches', 'reports', 'meta'], 'readwrite', (tx, guard) => {
        tx.objectStore('games').delete(key); tx.objectStore('drafts').delete(key);
        for (const name of ['reviews', 'batches', 'reports']) {
          const request = tx.objectStore(name).openCursor();
          request.onsuccess = guard(() => { const cursor = request.result; if (!cursor) return;
            const row = cursor.value;
            if (row.gameKey === key || row.gameKeys?.includes(key) || row.selectedGames?.some(game => game.key === key)) cursor.delete();
            cursor.continue();
          });
        }
        const last = tx.objectStore('meta').get('last-workspace'); last.onsuccess = guard(() => { if (last.result?.gameKey === key) tx.objectStore('meta').delete('last-workspace'); });
      });
      announce('games');
    },
    async clear() {
      // Keep database/schema; no origin-wide clear and no implicit preference reset.
      await transaction(STORES, 'readwrite', tx => { for (const name of STORES) tx.objectStore(name).clear(); });
      announce('games');
    },
    close() { closed = true; connection?.close(); connection = null; listeners.clear(); },
  };
}
