// Phase 4: game-review policy is independent of the position-engine depth.
// Balanced preserves the existing 16 / 1100 / 1400 ms review behavior. Budgets
// are limits/targets, never claims that the worker actually reached that depth.
export const REVIEW_POLICY_VERSION = 'linea-review-policy-2';
export const REVIEW_CLASSIFIER_VERSION = 'linea-classifier-2';
export const REVIEW_ACCURACY_VERSION = 'linea-accuracy-2';
export const REVIEW_POLICIES = Object.freeze({
  quick: Object.freeze({ id: 'quick', label: 'Quick', version: REVIEW_POLICY_VERSION, targetDepth: 12, positionMs: 450, sacrificeMs: 600, description: 'Shorter searches; more depth-limited judgments.' }),
  balanced: Object.freeze({ id: 'balanced', label: 'Balanced', version: REVIEW_POLICY_VERSION, targetDepth: 16, positionMs: 1100, sacrificeMs: 1400, description: 'The existing default review budget.' }),
  deeper: Object.freeze({ id: 'deeper', label: 'Deeper', version: REVIEW_POLICY_VERSION, targetDepth: 20, positionMs: 3000, sacrificeMs: 4000, description: 'More time per position; still not a guaranteed depth or verdict.' }),
});
export const DEFAULT_REVIEW_QUALITY = 'balanced';

export function reviewGamePayload(game) {
  // Deliberately excludes the session id: reimporting the same original game
  // has the same content signature but a new session identity/generation.
  return JSON.stringify({ initialFen: game.initialFen, pgn: game.rawPgn, moves: game.moves.map(move => [move.uci, move.color]) });
}
export async function reviewGameSignature(payload) {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot create the review fingerprint. Use a secure localhost/browser context.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function ruleDrawClaims(chess) {
  return { threefold: chess.isThreefoldRepetition(), fiftyMove: chess.isDrawByFiftyMoves() };
}
export function reviewTerminalEvaluation(chess) {
  // FIDE 9.6: fivefold/75-move draws are automatic; threefold/50 are claimable.
  // Reconstruct historical positions, preserving side/castling/legal EP rights.
  let reason, kind = 'terminal';
  if (chess.isCheckmate()) reason = 'checkmate';
  else if (chess.isStalemate()) reason = 'stalemate';
  else if (chess.isInsufficientMaterial()) reason = 'insufficient-material';
  else if (Number(chess.fen().split(' ')[4]) >= 150) reason = 'seventy-five-move-rule';
  else if (chess.isThreefoldRepetition()) {
    const key = fen => fen.split(' ').slice(0, 4).join(' ');
    const current = key(chess.fen()), history = chess.history({ verbose: true });
    const positions = history.length ? [history[0].before, ...history.map(move => move.after)] : [chess.fen()];
    if (positions.filter(fen => key(fen) === current).length >= 5) reason = 'fivefold-repetition';
  }
  if (!reason) return null;
  return { rank: 1, cp: reason === 'checkmate' ? chess.turn() === 'w' ? -100000 : 100000 : 0, mate: reason === 'checkmate' ? 0 : null, winner: reason === 'checkmate' ? chess.turn() === 'w' ? 'b' : 'w' : null, depth: 0, pv: [], exact: true, source: 'rules', kind, reason, targetDepth: null, budgetMs: null, elapsedMs: 0 };
}

export function evaluationDepthLabel(evaluation) {
  if (!evaluation) return 'Not evaluated';
  if (evaluation.source === 'rules' || evaluation.exact) {
    if (evaluation.kind === 'claimable-draw') return 'Rule draw available (claimable); no search depth';
    return `Exact ${evaluation.reason === 'checkmate' ? 'checkmate' : 'draw'}; no search depth`;
  }
  return `Reached depth ${evaluation.depth} / target ${evaluation.targetDepth ?? 'not recorded'}`;
}
