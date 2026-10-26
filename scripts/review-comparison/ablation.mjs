// Ablation table across exported runs. One layer changes per row; rows that were
// measured but not adopted are reported from their own probes in REPORT.md.
// Usage: node scripts/review-comparison/ablation.mjs baseline l1-correctness after
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = path.join(root, 'artifacts/testing/review-comparison');
const manifest = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/review-comparison/linea-review-comparison-manifest.json'), 'utf8'));
const SERIOUS = new Set(['mistake', 'blunder', 'miss']);
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const expected = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));
const load = dir => readdirSync(dir).filter(name => /-run\d+\.json$/.test(name)).map(name => JSON.parse(readFileSync(path.join(dir, name), 'utf8')));
const table = [];
for (const label of process.argv.slice(2)) {
  const items = load(path.join(base, label));
  const byGame = {}; for (const item of items) (byGame[item.run.id] ||= []).push(item);
  const sides = [], labels = [], eloDiffs = [], cats = {};
  let flips = 0, positionsDiffer = 0, positions = 0, provisional = 0, elapsed = 0, searches = 0, nodes = 0, eloAvailable = 0;
  for (const game of manifest.games) {
    const runs = byGame[game.id]?.sort((a, b) => a.run.run - b.run.run); if (!runs) continue;
    const first = runs[0].evidence;
    for (const color of ['w', 'b']) {
      sides.push(mean(runs.map(run => run.evidence.accuracy[color].accuracy)) - game.screenshots.chesscom.accuracy[color]);
      const value = first.experimentalGameElo[color].value;
      if (Number.isFinite(value)) { eloAvailable++; eloDiffs.push(value - game.screenshots.chesscom.gameRating[color]); }
    }
    if (runs[1]) {
      first.records.forEach((record, index) => { if (record.evidence.type !== runs[1].evidence.records[index].evidence.type) flips++; });
      for (const key of Object.keys(first.positions)) { positions++; const a = first.positions[key], b = runs[1].evidence.positions[key]; if (!(a.cp === b.cp && a.depth === b.depth && (a.pv || []).join() === (b.pv || []).join())) positionsDiffer++; }
    }
    provisional += first.accuracy.provisional; elapsed += runs[0].run.elapsedMs; searches += runs[0].run.searches; nodes += runs[0].run.nodes;
    for (const record of first.records) cats[record.evidence.type] = (cats[record.evidence.type] || 0) + 1;
    for (const reference of game.referenceLabels.labels) labels.push({ reference: reference.label, linea: first.records[reference.ply - 1].evidence.type });
  }
  const tp = labels.filter(l => SERIOUS.has(l.reference) && SERIOUS.has(l.linea)).length, fn = labels.filter(l => SERIOUS.has(l.reference) && !SERIOUS.has(l.linea)).length;
  const row = { label, diagnostic: {
    accuracySignedMean: mean(sides), accuracyAbsMean: mean(sides.map(Math.abs)),
    repeatRunLabelFlips: flips, repeatRunPositionsDiffer: `${positionsDiffer}/${positions}`, provisionalPlies: provisional,
    reviewSeconds: elapsed / 1000, searches, nodes, categories: cats,
    readableLabels: labels.length, exactLabelAgreement: labels.filter(l => l.reference === l.linea).length, seriousRecall: tp / (tp + fn), seriousTp: tp, seriousFn: fn,
    gameEstimateAvailable: `${eloAvailable}/10`, gameEstimateMinusChesscomMAE: eloDiffs.length ? mean(eloDiffs.map(Math.abs)) : null, gameEstimateMinusChesscomSigned: eloDiffs.length ? mean(eloDiffs) : null } };
  const validationDir = path.join(base, `validation-${label}`);
  if (existsSync(validationDir)) {
    const v = load(validationDir); row.validation = {};
    for (const split of ['exploration', 'evaluation']) {
      const diffs = [], predictions = [];
      for (const item of v.filter(x => x.validation.split === split)) for (const color of ['w', 'b']) {
        const acc = item.evidence.accuracy[color].accuracy; if (!Number.isFinite(acc)) continue;
        diffs.push(acc - item.validation.chesscomAccuracy[color]);
        const own = color === 'w' ? item.validation.whiteRating : item.validation.blackRating, opp = color === 'w' ? item.validation.blackRating : item.validation.whiteRating;
        const won = (color === 'w' ? item.validation.whiteResult : item.validation.blackResult) === 'win', lost = (color === 'w' ? item.validation.blackResult : item.validation.whiteResult) === 'win';
        const estimate = item.evidence.experimentalGameElo[color].value;
        if (Number.isFinite(estimate)) predictions.push({ result: won ? 1 : lost ? 0 : 0.5, estimate, own, opp });
      }
      const logLoss = predict => -mean(predictions.map(p => { const q = Math.min(1 - 1e-6, Math.max(1e-6, expected(predict(p), p.opp))); return p.result * Math.log(q) + (1 - p.result) * Math.log(1 - q); }));
      row.validation[split] = { sides: diffs.length, signed: mean(diffs), mae: mean(diffs.map(Math.abs)), rmse: Math.sqrt(mean(diffs.map(d => d * d))),
        gameEstimateAvailable: predictions.length, resultLogLossEstimate: predictions.length ? logLoss(p => p.estimate) : null, resultLogLossPgnRatingSameSides: predictions.length ? logLoss(p => p.own) : null };
    }
  }
  table.push(row);
}
writeFileSync(path.join(base, 'ablation.json'), `${JSON.stringify(table, null, 1)}\n`);
const f = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
console.log('| layer | diag acc signed / abs vs CC | label flips (2 runs) | positions differing | provisional | review s | serious recall (readable) | exact labels | miss/book/great | game est. avail / MAE vs CC | val eval signed / MAE | val eval est. logloss (vs PGN rating, same sides) |');
for (const row of table) {
  const d = row.diagnostic, e = row.validation?.evaluation, c = d.categories;
  console.log(`| ${row.label} | ${f(d.accuracySignedMean)} / ${f(d.accuracyAbsMean)} | ${d.repeatRunLabelFlips} | ${d.repeatRunPositionsDiffer} | ${d.provisionalPlies} | ${f(d.reviewSeconds, 0)} | ${d.seriousTp}/${d.seriousTp + d.seriousFn} | ${d.exactLabelAgreement}/${d.readableLabels} | ${c.miss || 0}/${c.book || 0}/${c.great || 0} | ${d.gameEstimateAvailable} / ${f(d.gameEstimateMinusChesscomMAE, 0)} | ${e ? `${f(e.signed)} / ${f(e.mae)}` : '—'} | ${e ? `${f(e.resultLogLossEstimate, 3)} (${f(e.resultLogLossPgnRatingSameSides, 3)})` : '—'} |`);
}
