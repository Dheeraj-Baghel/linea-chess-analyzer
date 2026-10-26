import { accuracySummary, clamp } from './accuracy.js';
import { REVIEW_POLICY_VERSION, REVIEW_CLASSIFIER_VERSION } from './reviewPolicy.js';
import { BOOK_EVIDENCE_VERSION } from './reviewBook.js';

// EXPERIMENTAL, UNCALIBRATED game-performance estimate. Not Elo/Glicko, not an
// account rating, not Chess.com's (private) Game Rating, not a skill measurement.
//
// Version history and provenance (22 Oct 2026 reliability audit):
// - elo-3 fitted two free constants (A, B) EXACTLY to the two sides of one
//   Chess.com review, game 185626013138 (White 85.4 -> 1700, Black 92.1 -> 1950,
//   as observed 21 Oct 2026). Two points fixing two constants is interpolation,
//   not calibration, and the previous comment's "no Chess.com data" claim was
//   inconsistent with it. A later screenshot of the same game shows 84.5 -> 1650
//   and 90.9 -> 1950; the reason for the difference is unknown. Both observations
//   are kept only as evaluation fixtures (tests/fixtures/review-comparison), never
//   as runtime rules.
// - elo-4 removes the one-game fit and every game-specific input. Inputs are the
//   player's own PGN rating (explicit anchor), the ACCURACY DIFFERENCE between the
//   two players in this game, and coverage gates. Rationale: on 74 unseen player
//   sides from 37 public games (both splits frozen before tuning), the realized
//   result was predicted better by own-rating + k * (own - opponent accuracy) than
//   by own rating alone or by elo-3 (see artifacts/testing/review-comparison).
//   The difference form also cancels shared per-game effects (time control,
//   position type, engine budget) that make absolute accuracy expectations
//   unreliable, so no time-control offset or expected-accuracy curve is needed.
// - k = PERFORMANCE_SCALE is a single rounded constant, chosen on the exploration
//   split only; the evaluation split was scored once afterwards. 54 + 20 sides is
//   a small sample: this remains `calibrated: false`.
//
// Accuracy is never adjusted toward a rating; ratings never affect accuracy or
// classification. The estimate is withheld when its inputs are not trustworthy.
export const GAME_RATING_VERSION = 'linea-experimental-game-elo-4';
export const PERFORMANCE_SCALE = 20; // rating points per accuracy point of difference
export const PERFORMANCE_CAP = 600;
export const MIN_DECISIONS = 10;
export const RATING_PROVENANCE = Object.freeze({
  method: 'own PGN rating + PERFORMANCE_SCALE x (own accuracy - opponent accuracy), capped',
  fitData: 'exploration split of tests/fixtures/review-comparison/validation-set.json (public Chess.com games, players disjoint from the evaluation split and from the diagnostic games)',
  retiredFit: { version: 'fit-1-game-185626013138', A: 15.9336, B: 0.45541, reason: 'two constants fitted exactly to the two sides of one game' },
  calibrated: false,
});

const parseRating = raw => /^\d{3,4}$/.test(raw || '') && Number(raw) >= 100 && Number(raw) <= 3500 ? Number(raw) : null;
const TIME_CLASSES = [['bullet', 180], ['blitz', 600], ['rapid', 1800], ['classical', Infinity]];
export function timeClass(header) {
  const match = /^(\d+)(?:\+(\d+))?$/.exec(String(header || '').trim());
  if (!match) return { name: 'unknown', estimatedSeconds: null };
  const seconds = Number(match[1]) + 40 * Number(match[2] || 0);
  return { name: TIME_CLASSES.find(([, limit]) => seconds < limit)[0], estimatedSeconds: seconds };
}
export function performanceEstimate(accuracy, opponentAccuracy, rating) {
  if (![accuracy, opponentAccuracy].every(Number.isFinite) || !Number.isFinite(rating)) return null;
  const difference = accuracy - opponentAccuracy;
  const delta = clamp(PERFORMANCE_SCALE * difference, -PERFORMANCE_CAP, PERFORMANCE_CAP);
  return { difference, delta, value: Math.round(clamp(rating + delta, 100, 3200) / 10) * 10, capped: Math.abs(PERFORMANCE_SCALE * difference) > PERFORMANCE_CAP };
}

export function experimentalGameRatings(game, review) {
  const summary = accuracySummary(game, review.records, review.generation?.id);
  const complete = summary.complete && review.generation?.status === 'completed';
  const tc = timeClass(game.headers.TimeControl);
  return Object.fromEntries(['w', 'b'].map(color => {
    const side = summary[color], other = summary[color === 'w' ? 'b' : 'w'];
    const meaningful = game.moves.filter((move, index) => move.color === color && !['book', 'forced'].includes(review.records[index + 1]?.type)).length;
    const opponentMeaningful = game.moves.filter((move, index) => move.color !== color && !['book', 'forced'].includes(review.records[index + 1]?.type)).length;
    const anchor = parseRating(game.headers[color === 'w' ? 'WhiteElo' : 'BlackElo']);
    const opponentRating = parseRating(game.headers[color === 'w' ? 'BlackElo' : 'WhiteElo']);
    // A relative estimate needs both players' evidence and an explicit anchor.
    // Without a PGN rating there is no defensible scale, so withhold it.
    let reason = !complete ? 'Requires a complete, non-provisional review.'
      : !['1-0', '0-1', '1/2-1/2'].includes(game.headers.Result) ? 'Requires a completed recorded game.'
        : game.isSample ? 'Fictional sample ratings are not used.'
          : meaningful < MIN_DECISIONS || opponentMeaningful < MIN_DECISIONS ? `Needs at least ${MIN_DECISIONS} non-book, non-forced decisions for both players.`
            : anchor === null ? 'Needs this player\'s rating in the PGN; no unanchored estimate is shown.' : null;
    if (!reason && (!Number.isFinite(side.accuracy) || !Number.isFinite(other.accuracy))) reason = 'No complete scoring evidence for both players.';
    const estimate = reason ? null : performanceEstimate(side.accuracy, other.accuracy, anchor);
    return [color, { value: estimate?.value ?? null, reason, mode: 'PGN-rating-anchored relative heuristic', anchor, opponentRating, accuracyDifference: estimate?.difference ?? null, ratingDelta: estimate?.delta ?? null, capped: estimate?.capped ?? false, timeClass: tc.name, decisions: meaningful, opponentDecisions: opponentMeaningful, accuracyInput: side.accuracy, opponentAccuracyInput: other.accuracy, scale: PERFORMANCE_SCALE, cap: PERFORMANCE_CAP, provenance: RATING_PROVENANCE, version: GAME_RATING_VERSION, calibrated: false }];
  }));
}
export function reviewExport(game, review) {
  const summary = accuracySummary(game, review.records, review.generation?.id);
  return { schema: 'linea-review-evidence-3', exportedAt: new Date().toISOString(), versions: { policy: review.generation?.policy?.version ?? REVIEW_POLICY_VERSION, classifier: review.generation?.classifierVersion ?? REVIEW_CLASSIFIER_VERSION, accuracy: summary.modelVersion, book: BOOK_EVIDENCE_VERSION, gameRating: GAME_RATING_VERSION }, originalPgn: game.rawPgn, initialFen: game.initialFen, generation: review.generation, accuracy: summary, experimentalGameElo: experimentalGameRatings(game, review), records: game.moves.map((move, index) => ({ ply: index + 1, color: move.color, uci: move.uci, san: move.san, weight: summary.weights[index] ?? null, evidence: review.records[index + 1] || null })), positions: review.positions, acceptances: review.acceptances, rechecks: review.rechecks, limitations: ['Bounded Stockfish searches are not proofs except rules-derived terminal outcomes.', 'Win percentage is a heuristic, not a calibrated probability.', 'Game performance is an experimental uncalibrated estimate anchored on the PGN rating, not a rating.'] };
}
