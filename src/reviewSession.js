import { Chess } from 'chess.js';
import { LocalEngine } from './engine.js';
import { ENGINE_BUILD } from './engineBuild.js';
import { classify, uciMove } from './chess.js';
import { sacrificeCandidate, withBrilliance } from './review.js';
import { DEFAULT_REVIEW_QUALITY, REVIEW_ACCURACY_VERSION, REVIEW_CLASSIFIER_VERSION, REVIEW_POLICIES, reviewGamePayload, reviewGameSignature, reviewTerminalEvaluation, ruleDrawClaims } from './reviewPolicy.js';
import { chanceLoss, whiteWinPercent } from './accuracy.js';
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
        let evaluation = reviewTerminalEvaluation(board);
        const budgetMs = kind === 'position' ? policy.positionMs : policy.sacrificeMs;
        if (!evaluation) {
          const began = elapsedTime();
          const result = await worker.analyze({ fen: board.fen(), position, depth: policy.targetDepth, ms: budgetMs, multiPv: 1, signal: job.controller.signal });
          assertActive();
          const line = result?.lines?.[0];
          if (!line || !Number.isFinite(line.cp) || !Number.isInteger(line.depth) || line.depth < 1) throw new Error('The engine did not return a scored review depth. Resume or rerun the review.');
          evaluation = { ...line, pv: [...(line.pv || [])], source: 'engine', kind: 'search', exact: false, nodes: result.nodes ?? null, nps: result.nps ?? null, bestMove: result.bestMove ?? null, targetDepth: policy.targetDepth, budgetMs, elapsedMs: Math.max(0, Math.round(elapsedTime() - began)) };
        }
        evaluation = { ...evaluation, generationId, ply, phase: kind, fen: board.fen(), claims: ruleDrawClaims(board), legalMovesCount: board.moves().length, evaluatedAt: timestamp() };
        assertActive();
        if (kind === 'position') emit({ positions: { ...state.positions, [ply]: evaluation }, generation: updateGeneration({}) });
        else emit({ acceptances: { ...state.acceptances, [ply]: evaluation }, generation: updateGeneration({}) });
        return evaluation;
      };
      const positionAt = ply => `position fen ${game.initialFen}${ply ? ` moves ${game.moves.slice(0, ply).map(move => move.uci).join(' ')}` : ''}`;
      const recheck = async (ply, move, before, after) => {
        if (state.rechecks[ply]) return state.rechecks[ply];
        const initialLoss = chanceLoss(before, after, move.color), sign = move.color === 'w' ? 1 : -1;
        const swing = Math.abs(whiteWinPercent(before) - whiteWinPercent(after));
        const missedMate = before.mate * sign > 0 && !(after.mate * sign > 0);
        const boundary = [3, 7, 15].some(value => Math.abs(initialLoss - value) <= 0.35);
        const needed = !after.exact && before.legalMovesCount > 1 && (initialLoss > 7 || swing > 12 || missedMate || before.pv?.[0] === move.uci && initialLoss > 1 || boundary);
        if (!needed) return null;
        emit({ stage: `Verifying disputed move ${ply} of ${game.moves.length}…` });
        const depth = Math.min(24, policy.targetDepth + 2), ms = policy.positionMs * 2;
        const search = async (searchMoves, multiPv) => {
          const began = elapsedTime();
          const result = await worker.analyze({ fen: move.before, position: positionAt(ply - 1), depth, ms, multiPv, searchMoves, signal: job.controller.signal }); assertActive();
          const line = result?.lines?.[0];
          const legal = new Set(new Chess(move.before).moves({ verbose: true }).map(raw => raw.from + raw.to + (raw.promotion || '')));
          if (!line || !Number.isFinite(line.cp) || !Number.isInteger(line.depth) || line.depth < 1 || !legal.has(line.pv?.[0]) || searchMoves.length && line.pv?.[0] !== move.uci) throw new Error('The engine did not return valid restricted-search evidence. Resume or rerun the review.');
          return { ...line, pv: [...line.pv], source: 'engine', exact: false, kind: searchMoves.length ? 'restricted-root' : 'root-candidates', multiPv, nodes: result.nodes ?? null, nps: result.nps ?? null, targetDepth: depth, budgetMs: ms, elapsedMs: Math.max(0, Math.round(elapsedTime() - began)), fen: move.before, position: positionAt(ply - 1), searchMoves, evaluatedAt: timestamp(), lines: result.lines };
        };
        // Same historical root, same MultiPV=1, same limits. Optional MultiPV=2
        // evidence informs special labels only, never numeric accuracy.
        const best = await search([], 1), played = await search([move.uci], 1); assertActive();
        const refinedLoss = chanceLoss(best, played, move.color);
        const improvement = (whiteWinPercent(played) - whiteWinPercent(best)) * sign;
        const provisional = best.depth < 12 || played.depth < 12 || improvement > 1 || best.pv[0] === move.uci && refinedLoss > 1;
        const previous = state.records[ply - 1];
        const candidates = !provisional && (best.pv[0] === move.uci && refinedLoss <= 1 || previous && ['mistake', 'blunder', 'miss'].includes(previous.type) && refinedLoss > 7) ? await search([], 2) : null;
        const second = candidates?.lines.find(line => line.rank === 2 && line.depth === candidates.depth && line.depth >= 12);
        const gapUsable = second && candidates.pv[0] === best.pv[0] && Math.abs(whiteWinPercent(candidates) - whiteWinPercent(best)) <= 1;
        const evidence = { best, played, candidates, initialLoss, refinedLoss, provisional, status: provisional ? 'unresolved' : 'verified', pvGap: gapUsable ? chanceLoss(candidates, second, move.color) : null };
        emit({ rechecks: { ...state.rechecks, [ply]: evidence } });
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
        const previous = state.records[ply - 1];
        const base = classify(before, after, move, { legalMovesCount: before.legalMovesCount, isBookMove: book.plies.has(ply), bookSource: book.source, provisional: Boolean(verification?.provisional) || !before.exact && before.depth < 12 || !after.exact && after.depth < 12, recheck: verification, pvGap: verification?.pvGap ?? null, opponentError: Boolean(previous && ['mistake', 'blunder', 'miss'].includes(previous.type)), ...(verification ? { comparisonBefore: verification.best, comparisonAfter: verification.played } : {}) });
        if (!base) throw new Error('The engine did not return a scored review. Resume the review.');
        const candidate = sacrificeCandidate(move, base);
        let accepted = null;
        if (candidate) {
          emit({ stage: `Checking a possible brilliant sacrifice at ${move.number}${move.color === 'w' ? '.' : '…'} ${move.san}…` });
          const capture = new Chess(game.initialFen);
          for (const original of game.moves.slice(0, ply)) capture.move(uciMove(original.uci));
          capture.move(uciMove(candidate.acceptance));
          accepted = await evaluate(capture, ply, 'sacrifice', `${positionAt(ply)} ${candidate.acceptance}`);
        }
        assertActive();
        const scored = withBrilliance(base, candidate, accepted, move);
        const provenance = Object.freeze({
          generationId, gameId: game.id, gameSignature: state.generation.game.signature,
          engine: state.generation.engine, policy: state.generation.policy,
          classifierVersion: REVIEW_CLASSIFIER_VERSION, accuracyVersion: REVIEW_ACCURACY_VERSION,
          reviewedAt: timestamp(), ply, color: move.color, uci: move.uci, san: move.san,
        });
        const record = { ...scored, provenance, sacrificeCheck: {
          status: candidate ? scored.brilliance?.verified ? 'verified' : 'not-verified' : Math.min(before.depth, after.depth) < 12 ? 'below-minimum-mainline-depth' : 'not-a-candidate',
          minimumDepth: 12, candidate, evaluation: accepted,
        } };
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
