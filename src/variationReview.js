import { Chess } from 'chess.js';
import { classify, toUci, uciMove } from './chess.js';
import { chanceLoss } from './accuracy.js';
import { bookMoveEvidence } from './reviewBook.js';
import { ENGINE_BUILD } from './engineBuild.js';
import { REVIEW_ACCURACY_VERSION, REVIEW_CLASSIFIER_VERSION, REVIEW_POLICIES } from './reviewPolicy.js';
import { evaluateReviewPosition, verifyReviewMove, scoreReviewMove } from './moveReview.js';

// Ephemeral branch evidence, NEVER a recorded-game checkpoint. A target is a
// historical move path, not just FEN or branch index: repetition, promotions,
// rewrites and different games/qualities must not reuse unrelated judgments.
const scopeKey = (game, quality) => JSON.stringify([game.id, game.initialFen, game.moves.map(move => move.uci), quality, REVIEW_POLICIES[quality].version]);
const pathKey = (variation, ply) => JSON.stringify([variation.basePly, variation.moves.slice(0, ply).map(move => move.uci)]);
export const variationReviewKey = (game, variation, ply, quality) => variation ? `${scopeKey(game, quality)}|${pathKey(variation, ply)}` : null;
const remember = (cache, key, value, limit) => { cache.delete(key); cache.set(key, value); if (cache.size > limit) cache.delete(cache.keys().next().value); };
const empty = () => ({ key: null, status: 'idle', stage: '', error: '', record: null, records: {}, evaluation: null });

export function createVariationReview({ createEngine, id = () => crypto.randomUUID(), timestamp = () => new Date().toISOString() }) {
  let state = empty(), scope = null, attempt = null, target = null, disposed = false;
  const listeners = new Set(), records = new Map(), positions = new Map();
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; for (const listener of listeners) listener(); } };
  const cancel = () => { const job = attempt; attempt = null; job?.controller.abort(); job?.worker?.dispose(); };
  const pause = (reason = 'Move review paused. Resume when ready.') => {
    cancel();
    if (state.key && state.status !== 'complete') emit({ status: 'paused', stage: reason, error: '' });
  };
  const branchRecords = variation => Object.fromEntries(variation.moves.flatMap((_, index) => {
    const record = records.get(pathKey(variation, index + 1));
    return record ? [[index + 1, record]] : [];
  }));
  const run = async (next, force = false) => {
    if (disposed) return;
    target = next;
    const { game, variation, ply, quality, mainline } = next;
    const key = variationReviewKey(game, variation, ply, quality);
    if (!force && key === state.key && !['paused', 'error'].includes(state.status)) return;
    cancel();
    const nextScope = scopeKey(game, quality);
    if (scope !== nextScope) { scope = nextScope; records.clear(); positions.clear(); }
    const cached = records.get(pathKey(variation, ply));
    emit({ ...empty(), key, status: cached ? 'complete' : ply ? 'thinking' : 'idle', stage: ply ? 'Analyzing this move...' : 'Play an alternate move to review it.', record: cached || null, records: branchRecords(variation), evaluation: cached?.after || null });
    if (cached || !ply) return;
    const job = { controller: new AbortController(), worker: null }; attempt = job;
    const active = () => !disposed && attempt === job && state.key === key && !job.controller.signal.aborted;
    const assertActive = () => { if (!active()) throw new DOMException('Obsolete variation move', 'AbortError'); };
    const policy = REVIEW_POLICIES[quality], generationId = `variation-${id()}`;
    try {
      // Replay the mainline PREFIX and current branch from the original root.
      // Merely loading the branch's FEN would lose repetition and draw history.
      const history = [...game.moves.slice(0, variation.basePly), ...variation.moves.slice(0, ply)];
      const boardAt = index => { const board = new Chess(game.initialFen); for (const move of history.slice(0, index)) board.move(uciMove(move.uci)); return board; };
      const positionAt = index => `position fen ${game.initialFen}${index ? ` moves ${history.slice(0, index).map(move => move.uci).join(' ')}` : ''}`;
      const absolutePly = history.length, beforeBoard = boardAt(absolutePly - 1), afterBoard = boardAt(absolutePly);
      const actual = afterBoard.history({ verbose: true }).at(-1);
      const move = { ...actual, uci: toUci(actual), number: Number(actual.before.split(' ')[5]) };
      job.worker = createEngine(reason => pause(reason === 'hidden' ? 'Move review paused while the tab is hidden.' : 'Move review paused for position analysis.'));
      const worker = job.worker;
      await worker.ready; assertActive();
      const common = { worker, policy, signal: job.controller.signal, assertActive, timestamp };
      const evaluate = async (board, position, kind = 'position') => {
        const cacheKey = `${kind}|${position}`;
        if (positions.has(cacheKey)) return positions.get(cacheKey);
        const evaluation = await evaluateReviewPosition({ ...common, board, position, kind }); assertActive();
        remember(positions, cacheKey, evaluation, 256);
        return evaluation;
      };
      const before = await evaluate(beforeBoard, positionAt(absolutePly - 1)); assertActive();
      const after = await evaluate(afterBoard, positionAt(absolutePly)); assertActive();
      emit({ evaluation: after });
      const book = await bookMoveEvidence({ ...game, moves: history, positions: [game.initialFen, ...history.map(move => move.after)] }); assertActive();
      let previous = ply > 1 ? records.get(pathKey(variation, ply - 1)) : mainline?.records?.[variation.basePly];
      if (ply === 1 && previous && (previous.provenance?.generationId !== mainline?.generation?.id || previous.provenance?.uci !== history[absolutePly - 2]?.uci || previous.after?.fen !== move.before)) previous = null;
      // Fast moves can outrun their predecessor's search. For a potential Miss,
      // establish whether that actual predecessor was an error instead of borrowing
      // the original game's next move or assuming an opportunity. This result is
      // only context; it is not cached as a fully reviewed branch move.
      if (!previous && absolutePly > 1 && chanceLoss(before, after, move.color) > 7) {
        const priorMove = history[absolutePly - 2], priorBoard = boardAt(absolutePly - 2);
        emit({ stage: 'Checking the preceding move...' });
        const priorBefore = await evaluate(priorBoard, positionAt(absolutePly - 2)); assertActive();
        const checked = await verifyReviewMove({ ...common, move: priorMove, before: priorBefore, after: before, position: positionAt(absolutePly - 2) }); assertActive();
        previous = classify(priorBefore, before, priorMove, { legalMovesCount: priorBefore.legalMovesCount, ...(checked ? { comparisonBefore: checked.best, comparisonAfter: checked.played } : {}) });
      }
      const verification = await verifyReviewMove({ ...common, move, before, after, previous, position: positionAt(absolutePly - 1), onVerify: () => emit({ stage: 'Verifying this move against the best alternative...' }) }); assertActive();
      const scored = await scoreReviewMove({ move, before, after, previous, verification, book, ply: absolutePly, evaluateAcceptance: async candidate => {
        emit({ stage: 'Checking the sacrifice and its legal acceptance...' });
        const capture = boardAt(absolutePly); capture.move(uciMove(candidate.acceptance));
        return evaluate(capture, `${positionAt(absolutePly)} ${candidate.acceptance}`, 'sacrifice');
      } }); assertActive();
      const record = { ...scored, provenance: {
        scope: 'variation', generationId, gameId: game.id, branchBasePly: variation.basePly, branchPly: ply,
        ply: absolutePly, color: move.color, uci: move.uci, san: move.san,
        position: positionAt(absolutePly), engine: ENGINE_BUILD, policy,
        classifierVersion: REVIEW_CLASSIFIER_VERSION, accuracyVersion: REVIEW_ACCURACY_VERSION, reviewedAt: timestamp(),
      } };
      remember(records, pathKey(variation, ply), record, 128);
      emit({ status: 'complete', stage: '', error: '', record, records: branchRecords(variation) });
    } catch (error) {
      if (active() && error.name !== 'AbortError') emit({ status: 'error', stage: '', error: error.message || 'Move review unavailable. Retry to analyze this move.' });
    } finally {
      job.worker?.dispose();
      if (attempt === job) attempt = null;
    }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setTarget: run,
    retry: () => target ? run(target, true) : Promise.resolve(),
    pause,
    clear() { cancel(); target = null; emit(empty()); },
    dispose() { cancel(); disposed = true; records.clear(); positions.clear(); listeners.clear(); },
  };
}

// Resume only work that exploration itself paused, in the SAME game/generation.
// Explicitly paused/completed reviews, pending-quality changes, navigation away,
// replacement games and hidden tabs never acquire an automatic resume claim.
export function createVariationHandoff(review) {
  let owner = null;
  return {
    enter(gameId) {
      const snapshot = review.getSnapshot();
      if (owner?.gameId !== gameId) owner = { gameId, generationId: null };
      // Import/checkpoint setup can start its review after the user already made
      // a branch. Capture that late start as well, without re-pausing on each ply.
      if (snapshot.gameId === gameId && snapshot.running) { owner.generationId = snapshot.generation?.id; review.stop(); }
    },
    leave(gameId) {
      const previous = owner; owner = null;
      const snapshot = review.getSnapshot();
      if (previous?.gameId === gameId && previous.generationId && snapshot.gameId === gameId && snapshot.generation?.id === previous.generationId && !snapshot.running && snapshot.selectedQuality === snapshot.generation.policy.id && snapshot.done < snapshot.total) return review.resume();
    },
    abandon() { owner = null; },
  };
}
