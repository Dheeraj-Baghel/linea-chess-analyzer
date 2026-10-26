// Validation-set analysis: Linea accuracy and experimental game estimates
// against Chess.com's published `accuracies` (public API), by frozen split.
// Descriptive agreement only; Chess.com values are not ground truth.
// Usage: node scripts/review-comparison/analyze-validation.mjs <label> [<label> ...]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stats = values => {
  const n = values.length, mean = values.reduce((a, b) => a + b, 0) / n;
  const abs = values.map(Math.abs), sorted = [...abs].sort((a, b) => a - b);
  return { n, signed: mean, mae: abs.reduce((a, b) => a + b, 0) / n, rmse: Math.sqrt(values.reduce((a, b) => a + b * b, 0) / n), median: sorted[Math.floor(n / 2)], worst: sorted.at(-1) };
};
const pearson = (x, y) => { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let s = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { s += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return s / Math.sqrt(sx * sy); };
const report = {};
for (const label of process.argv.slice(2)) {
  const dir = path.join(root, 'artifacts/testing/review-comparison', `validation-${label}`);
  const items = readdirSync(dir).filter(name => /-run1\.json$/.test(name)).map(name => JSON.parse(readFileSync(path.join(dir, name), 'utf8')));
  const sides = [];
  for (const item of items) for (const color of ['w', 'b']) {
    const v = item.validation, ev = item.evidence;
    const linea = ev.accuracy[color].accuracy, ref = v.chesscomAccuracy[color];
    const rating = color === 'w' ? v.whiteRating : v.blackRating, opponent = color === 'w' ? v.blackRating : v.whiteRating;
    const result = (color === 'w' ? v.whiteResult : v.blackResult) === 'win' ? 1 : (color === 'w' ? v.blackResult : v.whiteResult) === 'win' ? 0 : 0.5;
    sides.push({ id: v.id, split: v.split, color, timeClass: v.timeClass, plies: v.plies, rating, opponent, result, linea, ref, diff: Number.isFinite(linea) ? linea - ref : null, estimate: ev.experimentalGameElo[color].value, estimateReason: ev.experimentalGameElo[color].reason, provisional: ev.accuracy.provisional, complete: ev.accuracy.complete });
  }
  const bySplit = {};
  for (const split of ['exploration', 'evaluation', 'all']) {
    const rows = sides.filter(row => (split === 'all' || row.split === split) && Number.isFinite(row.diff));
    if (!rows.length) continue;
    const acc = stats(rows.map(row => row.diff));
    // Game performance: compare the estimate with a simple baseline (own PGN rating)
    // as predictors of the realized result via a logistic expected score. Without
    // Chess.com's published game rating, the only available target is the result.
    const est = rows.filter(row => Number.isFinite(row.estimate));
    const brier = predict => est.reduce((sum, row) => sum + (predict(row) - row.result) ** 2, 0) / est.length;
    const expected = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));
    bySplit[split] = {
      accuracy: { ...acc, pearson: pearson(rows.map(r => r.linea), rows.map(r => r.ref)) },
      byTimeClass: Object.fromEntries([...new Set(rows.map(r => r.timeClass))].map(tc => [tc, stats(rows.filter(r => r.timeClass === tc).map(r => r.diff))])),
      estimate: { available: est.length, sides: rows.length, unavailable: Object.entries(rows.filter(r => !Number.isFinite(r.estimate)).reduce((out, r) => ({ ...out, [r.estimateReason]: (out[r.estimateReason] || 0) + 1 }), {})),
        brierEstimateVsOpponentRating: est.length ? brier(row => expected(row.estimate, row.opponent)) : null,
        brierPgnRatingBaseline: est.length ? brier(row => expected(row.rating, row.opponent)) : null,
        meanAbsEstimateMinusRating: est.length ? est.reduce((s, r) => s + Math.abs(r.estimate - r.rating), 0) / est.length : null,
        pearsonEstimateRating: est.length > 2 ? pearson(est.map(r => r.estimate), est.map(r => r.rating)) : null },
    };
  }
  report[label] = { games: items.length, bySplit, sides };
  console.log(`== validation ${label}: ${items.length} games`);
  for (const [split, value] of Object.entries(bySplit)) {
    const a = value.accuracy, e = value.estimate;
    console.log(`${split.padEnd(11)} sides ${a.n}  signed ${a.signed.toFixed(2)}  MAE ${a.mae.toFixed(2)}  RMSE ${a.rmse.toFixed(2)}  median|d| ${a.median.toFixed(2)}  worst ${a.worst.toFixed(2)}  r ${a.pearson.toFixed(3)}`);
    console.log(`            by time class ${Object.entries(value.byTimeClass).map(([k, s]) => `${k}:${s.n}/${s.signed.toFixed(1)}/${s.mae.toFixed(1)}`).join('  ')}`);
    console.log(`            estimate available ${e.available}/${e.sides}  Brier(est) ${e.brierEstimateVsOpponentRating?.toFixed(4)}  Brier(PGN rating) ${e.brierPgnRatingBaseline?.toFixed(4)}  mean|est-rating| ${e.meanAbsEstimateMinusRating?.toFixed(0)}  unavailable ${JSON.stringify(e.unavailable)}`);
  }
}
writeFileSync(path.join(root, 'artifacts/testing/review-comparison', `validation-analysis-${process.argv.slice(2).join('-vs-')}.json`), `${JSON.stringify(report, null, 1)}\n`);
