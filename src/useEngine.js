import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LocalEngine } from './engine';
import { createReviewSession } from './reviewSession';
import { REVIEW_POLICIES } from './reviewPolicy';
import { reviewTerminalEvaluation } from './reviewPolicy';

function terminalEvaluation(chess) {
  const result = reviewTerminalEvaluation(chess);
  return result ? { lines: [result], nodes: 0, nps: 0 } : null;
}

export function usePositionEngine({ chess, position, count, enabled, depth, coordinator }) {
  const client = useRef(null), cache = useRef(new Map());
  const [ready, setReady] = useState(false), [retry, setRetry] = useState(0);
  const [state, setState] = useState({ fen: '', data: null });
  const [status, setStatus] = useState('loading'), [error, setError] = useState('');
  const fen = chess.fen();
  const terminal = terminalEvaluation(chess);
  const terminalKey = terminal ? JSON.stringify(terminal) : '';
  useEffect(() => {
    let alive = true;
    setReady(false); setError(''); setStatus('loading');
    if (!enabled) { setStatus('paused'); return; }
    try {
      const engine = coordinator ? coordinator.createClient('position') : new LocalEngine(); client.current = engine;
      engine.ready.then(() => { if (alive) setReady(true); }).catch(reason => {
        if (alive) { setError(reason.message); setStatus('error'); }
      });
      return () => { alive = false; engine.dispose(); if (client.current === engine) client.current = null; };
    } catch (reason) { setError(reason.message); setStatus('error'); }
    return () => { alive = false; };
  }, [retry, enabled, coordinator]);
  useEffect(() => {
    const key = `${position}|${count}|${depth}`;
    const stored = cache.current.get(key) || null;
    setState({ fen, data: terminal || stored });
    if (terminal) { setStatus('complete'); return; }
    if (!enabled) { setStatus('paused'); return; }
    if (!ready || !client.current) return;
    const controller = new AbortController();
    setError(''); setStatus('thinking');
    const timer = setTimeout(async () => {
      try {
        const data = await client.current.analyze({
          fen, position, multiPv: count, depth, ms: count === 1 ? 2600 : 4000, signal: controller.signal,
          onUpdate: data => {
            if (!controller.signal.aborted) {
              cache.current.set(key, data); setState({ fen, data });
            }
          },
        });
        if (!controller.signal.aborted) { cache.current.set(key, data); setState({ fen, data }); setStatus('complete'); }
      } catch (reason) {
        if (!controller.signal.aborted && reason.name !== 'AbortError') { setError(reason.message); setStatus('error'); }
      }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
    // terminalKey expresses draw/repetition state, which is not fully represented by FEN.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, position, count, depth, enabled, ready, retry, terminalKey]);
  return { data: state.fen === fen ? state.data : terminal, status, error, retry: () => setRetry(value => value + 1) };
}

// Keep ownership in App, not in a report/rail/drawer. A new game clears old
// generation data; changing the displayed report or pending quality does not.
export function useGameReview(game, coordinator) {
  const [session] = useState(() => {
    const owner = createReviewSession(coordinator ? { createEngine: () => coordinator.createClient('review', () => owner.stop()) } : {});
    return owner;
  });
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => { session.setGame(game); }, [session, game]);
  useEffect(() => () => session.dispose(), [session]);
  // Do not expose a previous game's records even for the render before effects.
  const state = snapshot.gameId === game.id ? snapshot : { ...snapshot, gameId: game.id, total: game.moves.length, records: {}, positions: {}, acceptances: {}, generation: null, running: false, stage: '', error: '', done: 0 };
  const selectedPolicy = REVIEW_POLICIES[state.selectedQuality];
  const hasPendingSettings = Boolean(state.generation && state.generation.policy.id !== state.selectedQuality);
  return {
    ...state, snapshot: state, selectedPolicy, hasPendingSettings,
    canResume: Boolean(state.generation && !state.running && state.done < state.total && !hasPendingSettings),
    start: session.start, stop: session.stop, resume: session.resume, rerun: session.rerun, setQuality: session.setQuality,
    restore: session.restore, subscribe: session.subscribe, getSnapshot: session.getSnapshot,
  };
}
