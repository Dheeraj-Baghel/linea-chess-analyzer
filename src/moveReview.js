import { Chess } from 'chess.js';
import { classify } from './chess.js';
import { sacrificeCandidate, withBrilliance } from './review.js';
import { chanceLoss, whiteWinPercent } from './accuracy.js';
import { SAME_ROOT_NOISE_TOLERANCE, reviewTerminalEvaluation, ruleDrawClaims } from './reviewPolicy.js';

// Shared evidence pipeline for recorded-game and live variation moves. Exploring
// must use the same thresholds, fresh hash, historical roots and sacrifice checks;
// only ownership/storage differs. Never classify from an after-position alone.
export async function evaluateReviewPosition({ board, position, worker, policy, signal, assertActive, kind = 'position', timestamp = () => new Date().toISOString(), elapsedTime = () => performance.now() }) {
  assertActive();
  let evaluation = reviewTerminalEvaluation(board);
  const budgetMs = kind === 'position' ? policy.positionMs : policy.sacrificeMs;
  if (!evaluation) {
    const began = elapsedTime();
    const result = await worker.analyze({ fen: board.fen(), position, depth: policy.targetDepth, ms: budgetMs, multiPv: 1, fresh: policy.freshHash, signal });
    assertActive();
    const line = result?.lines?.[0];
    if (!line || !Number.isFinite(line.cp) || !Number.isInteger(line.depth) || line.depth < 1) throw new Error('The engine did not return a scored review depth. Resume or retry the review.');
    evaluation = { ...line, pv: [...(line.pv || [])], source: 'engine', kind: 'search', exact: false, nodes: result.nodes ?? null, nps: result.nps ?? null, bestMove: result.bestMove ?? null, targetDepth: policy.targetDepth, budgetMs, elapsedMs: Math.max(0, Math.round(elapsedTime() - began)) };
  }
  return { ...evaluation, fen: board.fen(), claims: ruleDrawClaims(board), legalMovesCount: board.moves().length, evaluatedAt: timestamp() };
}

export async function verifyReviewMove({ move, before, after, previous, position, worker, policy, signal, assertActive, onVerify = () => {}, timestamp = () => new Date().toISOString(), elapsedTime = () => performance.now() }) {
  const initialLoss = chanceLoss(before, after, move.color), sign = move.color === 'w' ? 1 : -1;
  const swing = Math.abs(whiteWinPercent(before) - whiteWinPercent(after));
  const missedMate = before.mate * sign > 0 && !(after.mate * sign > 0);
  const boundary = [3, 7, 15].some(value => Math.abs(initialLoss - value) <= 0.35);
  const needed = !after.exact && before.legalMovesCount > 1 && (initialLoss > 7 || swing > 12 || missedMate || before.pv?.[0] === move.uci && initialLoss > 1 || boundary);
  if (!needed) return null;
  onVerify();
  const depth = Math.min(24, policy.targetDepth + 2), ms = policy.positionMs * 2;
  const search = async (searchMoves, multiPv) => {
    assertActive();
    const began = elapsedTime();
    const result = await worker.analyze({ fen: move.before, position, depth, ms, multiPv, searchMoves, fresh: policy.freshHash, signal });
    assertActive();
    const line = result?.lines?.[0];
    const legal = new Set(new Chess(move.before).moves({ verbose: true }).map(raw => raw.from + raw.to + (raw.promotion || '')));
    if (!line || !Number.isFinite(line.cp) || !Number.isInteger(line.depth) || line.depth < 1 || !legal.has(line.pv?.[0]) || searchMoves.length && line.pv?.[0] !== move.uci) throw new Error('The engine did not return valid restricted-search evidence. Resume or retry the review.');
    return { ...line, pv: [...line.pv], source: 'engine', exact: false, kind: searchMoves.length ? 'restricted-root' : 'root-candidates', multiPv, nodes: result.nodes ?? null, nps: result.nps ?? null, targetDepth: depth, budgetMs: ms, elapsedMs: Math.max(0, Math.round(elapsedTime() - began)), fen: move.before, position, searchMoves, evaluatedAt: timestamp(), lines: result.lines, completeLines: result.completeLines || null, completeDepth: result.completeDepth ?? null };
  };
  // Equal-limit single-PV searches of the SAME historical root. A confirmed best
  // move reuses its evidence, rather than treating a duplicate search's noise as loss.
  const best = await search([], 1); assertActive();
  const sameMove = best.pv[0] === move.uci;
  const played = sameMove && initialLoss <= SAME_ROOT_NOISE_TOLERANCE ? { ...best, kind: 'same-as-best', sameAsBest: true } : await search([move.uci], 1); assertActive();
  const refinedLoss = chanceLoss(best, played, move.color);
  const improvement = (whiteWinPercent(played) - whiteWinPercent(best)) * sign;
  const provisional = best.depth < 12 || played.depth < 12 || improvement > SAME_ROOT_NOISE_TOLERANCE || sameMove && refinedLoss > SAME_ROOT_NOISE_TOLERANCE;
  const candidates = !provisional && (best.pv[0] === move.uci && refinedLoss <= 1 || previous && ['mistake', 'blunder', 'miss'].includes(previous.type) && refinedLoss > 7) ? await search([], 2) : null;
  // Great/Miss gaps use ONE completed MultiPV iteration, never mixed-depth ranks.
  const iteration = candidates?.completeLines?.length >= 2 ? candidates.completeLines : null;
  const first = iteration?.find(line => line.rank === 1), second = iteration?.find(line => line.rank === 2);
  const gapUsable = first && second && first.depth >= 12 && first.pv?.[0] === best.pv[0] && Math.abs(whiteWinPercent(first) - whiteWinPercent(best)) <= 1;
  return { best, played, candidates, initialLoss, refinedLoss, provisional, status: provisional ? 'unresolved' : 'verified', pvGap: gapUsable ? chanceLoss(first, second, move.color) : null, gapDepth: gapUsable ? first.depth : null };
}

export async function scoreReviewMove({ move, before, after, previous, verification, book, ply, evaluateAcceptance }) {
  const base = classify(before, after, move, { legalMovesCount: before.legalMovesCount, isBookMove: book.plies.has(ply), bookSource: book.source, provisional: Boolean(verification?.provisional) || !before.exact && before.depth < 12 || !after.exact && after.depth < 12, recheck: verification, pvGap: verification?.pvGap ?? null, opponentError: Boolean(previous && ['mistake', 'blunder', 'miss'].includes(previous.type)), ...(verification ? { comparisonBefore: verification.best, comparisonAfter: verification.played } : {}) });
  if (!base) throw new Error('The engine did not return a scored review. Retry the review.');
  const candidate = sacrificeCandidate(move, base);
  const accepted = candidate ? await evaluateAcceptance(candidate) : null;
  const scored = withBrilliance(base, candidate, accepted, move);
  return { ...scored, sacrificeCheck: {
    status: candidate ? scored.brilliance?.verified ? 'verified' : 'not-verified' : Math.min(before.depth, after.depth) < 12 ? 'below-minimum-mainline-depth' : 'not-a-candidate',
    minimumDepth: 12, candidate, evaluation: accepted,
  } };
}
