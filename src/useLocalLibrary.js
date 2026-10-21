import { useEffect, useRef, useState } from 'react';
import { createLibrary, gameFromSaved, snapshotCompatible } from './library.js';
import { readWorkspaceRoute, workspaceUrl, writeWorkspaceRoute } from './workspaceRoute.js';

// Persistence is owned above panel presentations. It never uploads data and a
// failed save must not replace a completed in-memory result with an empty object.
export function useLocalLibrary({ game, review, draft, onOpen, onRoute, onLibrary }) {
  const subscribeReview = review.subscribe;
  const [library] = useState(() => createLibrary());
  const [state, setState] = useState({ games: [], currentKey: null, status: 'loading', error: '', notice: '' });
  const latest = useRef(null), active = useRef(null), opening = useRef(0), writes = useRef(Promise.resolve()), deleted = useRef(new Set());
  const deletedSessions = useRef(new Set());
  const pendingWrites = useRef(0);
  const returnPath = useRef(null);
  latest.current = { game, review, draft, onOpen, onRoute, onLibrary };
  const fail = error => setState(previous => ({ ...previous, status: 'error', error: error.message || 'Local save failed. Your current work remains in memory.' }));
  const refresh = async () => {
    try { const games = await library.listGames(); setState(previous => ({ ...previous, games, status: previous.error ? 'error' : 'saved' })); }
    catch (error) { fail(error); }
  };
  const persistReview = snapshot => {
    const current = active.current;
    if (!current || deleted.current.has(current.key) || snapshot.gameId !== latest.current.game.id || !snapshot.generation) return;
    // Capture now; pending display choices do not change an active generation's policy.
    const value = structuredClone(snapshot);
    pendingWrites.current++;
    setState(previous => ({ ...previous, status: previous.error ? 'error' : 'saving' }));
    writes.current = writes.current.catch(() => {}).then(async () => {
      if (deleted.current.has(current.key)) return;
      const saved = await library.saveCheckpoint(current.key, current.signature, value);
      if (saved && pendingWrites.current === 1) setState(previous => ({ ...previous, status: 'saved', error: '' }));
    }).catch(fail).finally(() => { pendingWrites.current--; if (!pendingWrites.current) setState(previous => ({ ...previous, status: previous.error ? 'error' : 'saved' })); });
  };
  const openSaved = async (key, route = null) => {
    const epoch = ++opening.current;
    latest.current.review.stop();
    try {
      const record = await library.getGame(key);
      if (!record) throw new Error('That local game is no longer saved in this browser. Import it again or choose another recent game.');
      const savedDraft = await library.read('drafts', key);
      if (epoch !== opening.current) return;
      const value = savedDraft?.signature === record.signature ? savedDraft.value : {};
      const next = { ...gameFromSaved(record), savedReviewQuality: value.displayedQuality || value.quality, pendingReviewQuality: value.quality };
      deleted.current.delete(key);
      latest.current.onOpen(next, { ...value, ...(route?.ply !== null && route?.ply !== undefined ? { ply: route.ply } : {}), ...(route ? { activePanel: route.view } : {}) });
      writeWorkspaceRoute(workspaceUrl(key, route?.ply ?? value.ply ?? 0, route?.view ?? value.activePanel), { replace: Boolean(route) });
    } catch (error) { fail(error); }
  };
  const actions = useRef(null);
  actions.current = { refresh, openSaved, persistReview, fail };

  useEffect(() => {
    let alive = true;
    const unsubscribe = library.subscribe(event => {
      if (!alive) return;
      if (event.error) actions.current.fail(new Error(event.error));
      if (event.kind === 'games') actions.current.refresh();
    });
    const route = async () => {
      opening.current++;
      const next = readWorkspaceRoute();
      if (next.kind === 'library') { latest.current.onLibrary(); return; }
      if (next.kind === 'missing') { actions.current.fail(new Error('This Linea page is unavailable. Open Recent local games or import a game.')); return; }
      if (['root', 'sample', 'games', 'player-report'].includes(next.kind)) { latest.current.onRoute(next); return; }
      if (next.kind === 'review') {
        if (next.key === active.current?.key) latest.current.onRoute(next);
        else await actions.current.openSaved(next.key, next);
      }
    };
    library.ready().then(async () => { if (!alive) return; await actions.current.refresh(); if (alive) await route(); }).catch(error => { if (alive) actions.current.fail(error); });
    window.addEventListener('popstate', route);
    return () => { alive = false; unsubscribe(); window.removeEventListener('popstate', route); library.close(); };
  }, [library]);

  useEffect(() => {
    const unsubscribe = subscribeReview(() => actions.current.persistReview(latest.current.review.getSnapshot()));
    return unsubscribe;
  }, [subscribeReview]);

  useEffect(() => {
    const epoch = ++opening.current;
    const startingPath = window.location.pathname;
    active.current = null;
    if (game.isSample || deleted.current.has(game.localKey)) return;
    let obsolete = false;
    setState(previous => ({ ...previous, status: 'saving', error: '', notice: '' }));
    library.saveGame(game).then(async record => {
      if (obsolete || epoch !== opening.current) return;
      deleted.current.delete(record.key);
      active.current = record;
      if (window.location.pathname === startingPath) writeWorkspaceRoute(workspaceUrl(record.key, latest.current.draft.ply, latest.current.draft.activePanel), { replace: Boolean(game.localKey) });
      setState(previous => ({ ...previous, currentKey: record.key, status: 'saved' }));
      const quality = game.savedReviewQuality || latest.current.draft.quality || latest.current.review.selectedQuality;
      const stored = await library.reviewState(record.key, record.signature, quality);
      const saved = snapshotCompatible(record.signature, game.reviewSnapshot, quality) ? { snapshot: game.reviewSnapshot } : stored.review;
      if (obsolete || epoch !== opening.current) return;
      const stillReviewing = () => readWorkspaceRoute().kind === 'review' && readWorkspaceRoute().key === record.key;
      if (saved && !latest.current.review.getSnapshot().generation) {
        if (!stillReviewing()) return;
        const restored = await latest.current.review.restore(saved.snapshot);
        if (obsolete || epoch !== opening.current) return;
        if (restored && game.pendingReviewQuality) latest.current.review.setQuality(game.pendingReviewQuality);
        if (!restored) setState(previous => ({ ...previous, notice: 'Saved review could not be safely restored. It remains stored; run an explicit fresh review.' }));
        else setState(previous => ({ ...previous, notice: saved.snapshot.generation.status === 'completed' ? 'Compatible saved evidence restored without recomputation.' : 'Saved review is paused. Resume when you are ready.' }));
      } else if (stored.kind === 'stale') {
        setState(previous => ({ ...previous, notice: 'Older review evidence is retained but is not compatible with this game or policy. Start an explicit review to analyze again.' }));
      } else if (!saved && !game.localKey && game.source?.autoReview && !latest.current.review.getSnapshot().generation && stillReviewing()) {
        latest.current.review.start();
      }
      const currentDraft = latest.current.draft;
      await library.saveDraft(record.key, record.signature, currentDraft);
      if (readWorkspaceRoute().kind === 'review' && readWorkspaceRoute().key === record.key) writeWorkspaceRoute(workspaceUrl(record.key, currentDraft.ply, currentDraft.activePanel), { replace: true });
      actions.current.persistReview(latest.current.review.getSnapshot());
    }).catch(error => {
      if (obsolete) return;
      actions.current.fail(error);
      if (!game.localKey && game.source?.autoReview && !latest.current.review.getSnapshot().generation && window.location.pathname === startingPath) latest.current.review.start();
    });
    return () => { obsolete = true; };
  }, [game, library]);

  useEffect(() => {
    const current = active.current;
    if (!current || deleted.current.has(current.key)) return;
    // Draft writes are small; all mainline evidence commits are saved separately.
    library.saveDraft(current.key, current.signature, draft).catch(error => actions.current.fail(error));
    if (readWorkspaceRoute().kind === 'review') writeWorkspaceRoute(workspaceUrl(current.key, draft.ply, draft.activePanel), { replace: true });
  }, [draft, library]);

  return { ...state, library,
    openSaved,
    show() { returnPath.current = window.location.pathname + window.location.search; writeWorkspaceRoute('/library'); onLibrary(); refresh(); },
    close() { const current = active.current; writeWorkspaceRoute(returnPath.current || (current ? workspaceUrl(current.key, draft.ply, draft.activePanel) : '/'), { replace: true }); },
    async remove(key) {
      opening.current++; deleted.current.add(key);
      if (active.current?.key === key) { review.stop(); deletedSessions.current.add(game.id); active.current = null; setState(previous => ({ ...previous, currentKey: null, notice: 'Local copy deleted. This open board remains in memory; new background writes are disabled.' })); }
      await writes.current.catch(() => {});
      try { await library.deleteGame(key); await refresh(); } catch (error) { fail(error); throw error; }
    },
    async clear() {
      opening.current++; review.stop(); deletedSessions.current.add(game.id); for (const row of state.games) deleted.current.add(row.key); active.current = null;
      await writes.current.catch(() => {});
      try { await library.clear(); setState(previous => ({ ...previous, games: [], currentKey: null, notice: 'Linea library cleared. Display preferences and the open in-memory board are unchanged.' })); } catch (error) { fail(error); throw error; }
    },
    async retry() {
      try {
        await library.retry();
        if (!game.isSample && !deletedSessions.current.has(game.id)) {
          const record = await library.saveGame(game); active.current = record;
          await library.saveDraft(record.key, record.signature, draft);
          setState(previous => ({ ...previous, currentKey: record.key, status: 'saved', error: '' }));
          persistReview(review.getSnapshot());
        } else setState(previous => ({ ...previous, status: 'saved', error: '' }));
        await refresh();
      } catch (error) { fail(error); }
    },
  };
}
