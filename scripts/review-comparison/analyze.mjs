// Diagnostic analysis of exported review evidence against the screenshot
// observations. Descriptive only: screenshot values are not ground truth, and
// nothing here feeds back into runtime scoring.
// Usage: node scripts/review-comparison/analyze.mjs <label> [--ledger]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const label = process.argv[2];
const dir = path.join(root, 'artifacts/testing/review-comparison', label);
const manifest = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/review-comparison/linea-review-comparison-manifest.json'), 'utf8'));
const files = readdirSync(dir).filter(name => /-run\d+\.json$/.test(name));
const exports = files.map(name => JSON.parse(readFileSync(path.join(dir, name), 'utf8')));
const SERIOUS = new Set(['mistake', 'blunder', 'miss']);
const CATS = ['brilliant', 'great', 'book', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced'];
const fmt = value => Number.isFinite(value) ? value.toFixed(2) : '—';

const byGame = {};
for (const item of exports) (byGame[item.run.id] ||= []).push(item);
const out = { label, games: [], agreement: {}, perPly: {} };
const diffs = [];
for (const game of manifest.games) {
  const items = byGame[game.id]; if (!items) continue;
  const first = items[0].evidence;
  const ref = game.screenshots.chesscom, hist = game.screenshots.linea;
  const runs = items.map(item => ({ w: item.evidence.accuracy.w.accuracy, b: item.evidence.accuracy.b.accuracy, eloW: item.evidence.experimentalGameElo.w.value, eloB: item.evidence.experimentalGameElo.b.value, elapsedMs: item.run.elapsedMs }));
  const sides = ['w', 'b'].map(color => {
    const values = runs.map(run => run[color]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const spread = Math.max(...values) - Math.min(...values);
    const diff = mean - ref.accuracy[color];
    diffs.push({ id: game.id, color, diff });
    return { color, mean, spread, chesscom: ref.accuracy[color], historicalLinea: hist.accuracy[color], diff };
  });
  // Label stability across runs and counts per side.
  const labelsPerRun = items.map(item => item.evidence.records.map(record => record.evidence?.type));
  const unstable = labelsPerRun[0].map((type, index) => labelsPerRun.some(labels => labels[index] !== type) ? index + 1 : null).filter(Boolean);
  const counts = Object.fromEntries(CATS.map(cat => [cat, { w: 0, b: 0 }]));
  first.records.forEach(record => { if (record.evidence) counts[record.evidence.type][record.color]++; });
  // Per-ply comparison with explicitly readable Chess.com icons.
  const perPly = game.referenceLabels.labels.map(reference => {
    const record = first.records[reference.ply - 1], e = record.evidence;
    return { ply: reference.ply, color: reference.color, san: reference.san, uci: record.uci, chesscom: reference.label, linea: e?.type, loss: e?.loss, provisional: e?.provisional, depthBefore: (e?.comparisonBefore || e?.before)?.depth, depthAfter: (e?.comparisonAfter || e?.after)?.depth, before: e?.before?.mate ?? e?.before?.cp, after: e?.after?.mate ?? e?.after?.cp, beforeIsMate: e?.before?.mate !== null && e?.before?.mate !== undefined, afterIsMate: e?.after?.mate !== null && e?.after?.mate !== undefined, best: (e?.comparisonBefore || e?.before)?.pv?.[0], rechecked: Boolean(e?.recheck), labelStableAcrossRuns: !unstable.includes(reference.ply) };
  });
  out.perPly[game.id] = perPly;
  out.games.push({ id: game.id, plies: game.plies, runs, sides, unstablePlies: unstable, counts, chesscomCounts: ref.counts, eloRef: ref.gameRating, eloHistorical: hist.estimate, elo: first.experimentalGameElo, provisional: first.accuracy.provisional, complete: first.accuracy.complete });
}
const abs = diffs.map(d => Math.abs(d.diff));
out.agreement = { sides: diffs.length, signedMean: diffs.reduce((a, d) => a + d.diff, 0) / diffs.length, absMean: abs.reduce((a, b) => a + b, 0) / abs.length, worst: diffs.reduce((a, d) => Math.abs(d.diff) > Math.abs(a.diff) ? d : a) };
// Confusion matrix and serious-error precision/recall over readable icons only.
const all = Object.values(out.perPly).flat();
const matrix = {};
for (const row of all) { (matrix[row.chesscom] ||= {})[row.linea] = (matrix[row.chesscom][row.linea] || 0) + 1; }
const tp = all.filter(r => SERIOUS.has(r.chesscom) && SERIOUS.has(r.linea)).length;
const fn = all.filter(r => SERIOUS.has(r.chesscom) && !SERIOUS.has(r.linea)).length;
const fp = all.filter(r => !SERIOUS.has(r.chesscom) && SERIOUS.has(r.linea)).length;
out.labels = { readable: all.length, exact: all.filter(r => r.chesscom === r.linea).length, matrix, serious: { tp, fn, fp, precisionOverReadable: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, note: 'Precision is over readable icons only; Chess.com shows icons mainly for notable moves, so unlabeled Linea serious errors cannot be counted as false positives and true precision is unknown.' } };
writeFileSync(path.join(dir, 'analysis.json'), `${JSON.stringify(out, null, 1)}\n`);

console.log(`== ${label}: accuracy vs Chess.com screenshots (mean over runs)`);
for (const game of out.games) for (const side of game.sides) console.log(`${game.id} ${side.color}  linea ${fmt(side.mean)} (spread ${fmt(side.spread)})  hist ${fmt(side.historicalLinea)}  chess.com ${fmt(side.chesscom)}  diff ${side.diff >= 0 ? '+' : ''}${fmt(side.diff)}`);
console.log(`signed mean ${fmt(out.agreement.signedMean)}  abs mean ${fmt(out.agreement.absMean)}  worst ${out.agreement.worst.id} ${out.agreement.worst.color} ${fmt(out.agreement.worst.diff)}`);
console.log('== game estimates (first run)');
for (const game of out.games) console.log(`${game.id}  linea ${game.elo.w.value ?? '—'}/${game.elo.b.value ?? '—'} (${game.elo.w.reason || game.elo.b.reason || 'available'})  hist ${game.eloHistorical.w ?? '—'}/${game.eloHistorical.b ?? '—'}  chess.com ${game.eloRef.w}/${game.eloRef.b}`);
console.log('== label stability: unstable plies per game', out.games.map(g => `${g.id}:${g.unstablePlies.length}`).join(' '));
console.log(`== readable per-ply labels ${out.labels.readable}, exact ${out.labels.exact}; serious tp ${tp} fn ${fn} fp ${fp}`);
console.log(JSON.stringify(matrix));
if (process.argv.includes('--ledger')) for (const [id, rows] of Object.entries(out.perPly)) for (const r of rows) if (r.chesscom !== r.linea) console.log(`${id} ply ${r.ply} ${r.color} ${r.san} cc=${r.chesscom} linea=${r.linea} loss=${fmt(r.loss)} prov=${r.provisional} d=${r.depthBefore}/${r.depthAfter} before=${r.before}${r.beforeIsMate ? 'M' : ''} after=${r.after}${r.afterIsMate ? 'M' : ''} best=${r.best} played=${r.uci} stable=${r.labelStableAcrossRuns}`);
