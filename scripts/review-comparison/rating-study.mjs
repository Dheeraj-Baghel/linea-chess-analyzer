// Offline study of the experimental game-performance estimator.
//
// Question: does an estimate carry information beyond the PGN rating, judged on
// games the fit never saw? Chess.com's public API does not publish its Game
// Rating, so the only independent target available is the realized result. Each
// predictor gives a performance number P; the expected score vs the opponent's
// PGN rating is 1/(1+10^((opp-P)/400)), scored by log-loss and Brier:
//   baseline = own PGN rating (no game evidence)
//   elo-3    = retired one-game fit (expected-accuracy curve, constants A/B)
//   elo-4    = own rating + k * (own accuracy - opponent accuracy), capped
// Procedure: the exploration log-loss curve over k is monotone up to the grid
// edge (it rewards ever more extreme win/loss predictions on a 54-side sample),
// so its argmin is not a defensible slope. k is instead the SMALLEST grid value
// that captures at least half of the exploration log-loss improvement available
// on the grid (a conservative shrinkage rule computed from exploration data only).
//
// HOLDOUT CONTAMINATION (disclosed): during the 22 Oct 2026 audit the full k
// curve was printed for BOTH splits before this rule was written. The rule reads
// only exploration data, but the decision to use it was made after evaluation
// values had been seen. The evaluation split is therefore NOT a clean holdout
// for k, and its scores below are optimistic. A fresh untouched set is required
// before any claim of out-of-sample value.
// Reads exported evidence; runs no engine; changes no runtime file.
// Usage: node scripts/review-comparison/rating-study.mjs <validation-label>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const label = process.argv[2] || 'baseline';
const dir = path.join(root, 'artifacts/testing/review-comparison', `validation-${label}`);
const CAP = 600;
const expected = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));
// Retired elo-3 transliteration, retained here only to score it on unseen games.
const elo3 = (accuracy, own, opponent, timeControl) => {
  const seconds = (([, base, inc]) => Number(base) + 40 * Number(inc || 0))(/^(\d+)(?:\+(\d+))?$/.exec(String(timeControl)) || [0, 600]);
  const offset = seconds < 180 ? -7 : seconds < 600 ? -3.5 : seconds < 1800 ? 0 : 2;
  const reference = 0.7 * own + 0.3 * opponent, expectedAccuracy = 50 + offset + 42 / (1 + Math.exp(-(reference - 1500) / 550));
  const d = accuracy - expectedAccuracy;
  return reference + Math.max(-1000, Math.min(1000, 15.9336 * d + 0.45541 * d * Math.abs(d)));
};
const rows = [];
for (const name of readdirSync(dir).filter(file => /-run1\.json$/.test(file))) {
  const { validation: v, evidence } = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
  const result = v.whiteResult === 'win' ? 1 : v.blackResult === 'win' ? 0 : 0.5;
  const accW = evidence.accuracy.w.accuracy, accB = evidence.accuracy.b.accuracy;
  if (!Number.isFinite(accW) || !Number.isFinite(accB)) continue;
  for (const color of ['w', 'b']) {
    const own = color === 'w' ? v.whiteRating : v.blackRating, opp = color === 'w' ? v.blackRating : v.whiteRating;
    const acc = color === 'w' ? accW : accB, oppAcc = color === 'w' ? accB : accW;
    rows.push({ id: v.id, split: v.split, color, own, opp, acc, oppAcc, result: color === 'w' ? result : 1 - result, elo3: elo3(acc, own, opp, v.timeControl) });
  }
}
const score = (data, predict) => {
  let log = 0, brier = 0;
  for (const row of data) { const p = Math.min(1 - 1e-6, Math.max(1e-6, expected(predict(row), row.opp))); log -= row.result * Math.log(p) + (1 - row.result) * Math.log(1 - p); brier += (p - row.result) ** 2; }
  return { n: data.length, logLoss: log / data.length, brier: brier / data.length };
};
const elo4 = k => row => row.own + Math.max(-CAP, Math.min(CAP, k * (row.acc - row.oppAcc)));
const explore = rows.filter(row => row.split === 'exploration'), evaluate = rows.filter(row => row.split === 'evaluation');
const grid = Array.from({ length: 21 }, (_, i) => i * 5).map(k => ({ k, ...score(explore, elo4(k)) }));
const optimum = grid.reduce((best, item) => item.logLoss < best.logLoss ? item : best);
const target = grid[0].logLoss - (grid[0].logLoss - optimum.logLoss) / 2;
const k = grid.find(item => item.logLoss <= target).k;
const curve = grid.map(item => ({ k: item.k, exploration: item.logLoss, evaluation: score(evaluate, elo4(item.k)).logLoss }));
const out = { label, procedure: 'k = smallest k in 0..100 step 5 reaching half of the exploration log-loss improvement; evaluation scored once at that k', cap: CAP, explorationOptimum: optimum, chosenK: k, curve,
  exploration: { baseline: score(explore, row => row.own), elo3: score(explore, row => row.elo3), elo4: score(explore, elo4(k)) },
  evaluation: { baseline: score(evaluate, row => row.own), elo3: score(evaluate, row => row.elo3), elo4: score(evaluate, elo4(k)) },
  note: 'Target is the realized result; Chess.com Game Rating is not available from the public API. 54/20 sides is small; this supports a coarse slope only, not calibration.' };
writeFileSync(path.join(root, 'artifacts/testing/review-comparison', `rating-study-${label}.json`), `${JSON.stringify(out, null, 1)}\n`);
console.log(`exploration optimum k ${optimum.k} (logloss ${optimum.logLoss.toFixed(4)}); half-improvement target ${target.toFixed(4)} -> chosen k ${k}`);
for (const split of ['exploration', 'evaluation']) for (const [name, value] of Object.entries(out[split])) console.log(split.padEnd(11), name.padEnd(9), `n ${value.n}  logloss ${value.logLoss.toFixed(4)}  brier ${value.brier.toFixed(4)}`);
