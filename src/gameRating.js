import { accuracySummary, clamp } from './accuracy.js';

export const GAME_RATING_VERSION = 'linea-experimental-game-elo-3';
// User asked (21 Oct 2026) for "Chess.com-like" game rating logic. Chess.com's formula is NOT
// public; its help centre only states the inputs: the player's accuracy, the player's rating,
// the opponent's rating and the time control (same moves -> different rating for different
// player ratings). This v2 heuristic uses exactly those inputs:
//   1. Expected accuracy curve E(R, tc): logistic in rating, shifted down for faster games.
//   2. Reference R0 = 0.7 x own rating + 0.3 x opponent rating (own only if opponent unknown;
//      1500 if no PGN ratings).
//   3. d = accuracy - E(R0, tc)  (how much better/worse than typical for that rating).
//   4. Performance = R0 + clamp(A x d + B x d x |d|, +/-1000).
// v3 calibration (A, B) is fitted to the ONLY reference available: one user-supplied Chess.com
// review, game 185626013138 (rapid 600, 2026-10-20): White 1197, accuracy 85.4 -> 1700;
// Black 1203, accuracy 92.1 -> 1950. Two points fit two constants exactly, so this reproduces
// that game but is NOT validated on any other game.
export const RATING_FIT = { A: 15.9336, B: 0.45541, cap: 1000, version: 'fit-1-game-185626013138' };
export function performanceRating(accuracy, own, opponent, offset = 0) {
  const reference = own === null ? 1500 : opponent === null ? own : 0.7 * own + 0.3 * opponent;
  const expected = expectedAccuracy(reference, offset), d = accuracy - expected;
  return { reference, expected, delta: clamp(RATING_FIT.A * d + RATING_FIT.B * d * Math.abs(d), -RATING_FIT.cap, RATING_FIT.cap) };
}
// Still UNCALIBRATED: no Chess.com data, not Elo/Glicko or an account rating. Never feeds back
// into numeric accuracy or Brilliant detection.
const TIME_CLASSES = [['bullet', 180, -7], ['blitz', 600, -3.5], ['rapid', 1800, 0], ['classical', Infinity, 2]];
export function timeClass(header) {
  const match = /^(\d+)(?:\+(\d+))?$/.exec(String(header || '').trim());
  if (!match) return { name: 'unknown', offset: 0, estimatedSeconds: null };
  const seconds = Number(match[1]) + 40 * Number(match[2] || 0);
  const [name, , offset] = TIME_CLASSES.find(([, limit]) => seconds < limit);
  return { name, offset, estimatedSeconds: seconds };
}
export const expectedAccuracy = (rating, offset = 0) => 50 + offset + 42 / (1 + Math.exp(-(rating - 1500) / 550));
export function accuracyLevel(accuracy, offset = 0) {
  const y = clamp((accuracy - 50 - offset) / 42, 0.01, 0.99);
  return 1500 - 550 * Math.log(1 / y - 1);
}
const parseRating = raw => /^\d{3,4}$/.test(raw || '') && Number(raw) >= 100 && Number(raw) <= 3500 ? Number(raw) : null;
export function experimentalGameRatings(game, review) {
  const summary = accuracySummary(game, review.records, review.generation?.id);
  const complete = summary.complete && review.generation?.status === 'completed';
  const tc = timeClass(game.headers.TimeControl);
  return Object.fromEntries(['w', 'b'].map(color => {
    const side = summary[color];
    const meaningful = game.moves.filter((move, index) => move.color === color && !['book', 'forced'].includes(review.records[index + 1]?.type)).length;
    let reason = !complete ? 'Requires a complete, non-provisional review.' : !['1-0', '0-1', '1/2-1/2'].includes(game.headers.Result) ? 'Requires a completed recorded game.' : game.isSample ? 'Fictional sample ratings are not used.' : meaningful < 10 ? 'Needs at least 10 non-book, non-forced decisions for this player.' : null;
    if (!Number.isFinite(side.accuracy)) reason = 'No complete scoring evidence for this player.';
    const anchor = parseRating(game.headers[color === 'w' ? 'WhiteElo' : 'BlackElo']);
    const opponent = parseRating(game.headers[color === 'w' ? 'BlackElo' : 'WhiteElo']);
    const fit = Number.isFinite(side.accuracy) ? performanceRating(side.accuracy, anchor, opponent, tc.offset) : null;
    const raw = fit ? fit.reference + fit.delta : null;
    return [color, { value: reason || raw === null ? null : Math.round(clamp(raw, 100, 3200) / 10) * 10, reason, mode: anchor === null ? 'unanchored heuristic (1500 reference)' : 'PGN-rating-anchored heuristic', anchor, opponentRating: opponent, referenceRating: fit?.reference ?? null, timeClass: tc.name, timeOffset: tc.offset, assumedBaselineAccuracy: fit?.expected ?? null, ratingDelta: fit?.delta ?? null, fit: RATING_FIT, decisions: meaningful, accuracyInput: side.accuracy, version: GAME_RATING_VERSION, calibrated: false }];
  }));
}
export function reviewExport(game, review) {
  const summary = accuracySummary(game, review.records, review.generation?.id);
  return { schema: 'linea-review-evidence-2', exportedAt: new Date().toISOString(), originalPgn: game.rawPgn, initialFen: game.initialFen, generation: review.generation, accuracy: summary, experimentalGameElo: experimentalGameRatings(game, review), records: game.moves.map((move, index) => ({ ply: index + 1, color: move.color, uci: move.uci, san: move.san, weight: summary.weights[index] ?? null, evidence: review.records[index + 1] || null })), positions: review.positions, acceptances: review.acceptances, rechecks: review.rechecks, limitations: ['Bounded Stockfish searches are not proofs except rules-derived terminal outcomes.', 'Win percentage is a heuristic, not a calibrated probability.', 'Game Elo is an experimental uncalibrated estimate, not a rating.'] };
}
