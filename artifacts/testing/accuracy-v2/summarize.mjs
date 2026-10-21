// Reproduce evidence-only comparisons without running or inventing engine searches.
import fs from 'node:fs/promises';
import { accuracySummary, chanceLoss, accuracyFromLoss } from '../../../src/accuracy.js';
const root = new URL('./', import.meta.url);
const load = async path => JSON.parse(await fs.readFile(new URL(path, root), 'utf8'));
const benchmark = await load('native-benchmark.json');
const oldChance = cp => 100 / (1 + Math.exp(-Math.max(-3000, Math.min(3000, cp)) / 330));
const oldLoss = (record, color) => Math.max(0, (oldChance(record.before.cp) - oldChance(record.after.cp)) * (color === 'w' ? 1 : -1));
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const comparisons = benchmark.results.map(result => {
  const records = result.state.records, entries = Object.entries(records).sort(([a], [b]) => Number(a) - Number(b));
  const game = { moves: entries.map(([, record]) => ({ color: record.provenance.color })) };
  const rawRecords = Object.fromEntries(entries.map(([ply, record]) => [ply, { ...record, loss: chanceLoss(record.before, record.after, record.provenance.color) }]));
  const rawSummary = accuracySummary(game, rawRecords);
  const moves = entries.map(([ply, record]) => ({ ply: Number(ply), color: record.provenance.color, uci: record.provenance.uci, san: record.provenance.san, v1LossOnSameRawEvidence: oldLoss(record, record.provenance.color), v1AccuracyOnSameRawEvidence: 100 * Math.exp(-oldLoss(record, record.provenance.color) / 20), v2LossOnRawEvidence: rawRecords[ply].loss, v2AccuracyOnRawEvidence: accuracyFromLoss(rawRecords[ply].loss), v2RefinedLoss: record.loss, v2RefinedAccuracy: record.accuracy, recheck: record.recheck?.status || null, classification: record.type, provisional: record.provisional }));
  return { fixture: result.name, quality: result.quality, elapsedMs: result.elapsedMs, plies: entries.length, v1ArithmeticOnSameRawEvidence: Object.fromEntries(['w', 'b'].map(color => [color, mean(moves.filter(move => move.color === color).map(move => move.v1AccuracyOnSameRawEvidence))])), v2AggregationOnSameRawEvidence: { w: rawSummary.w.accuracy, b: rawSummary.b.accuracy }, v2WithRootRefinements: { w: result.summary.w.accuracy, b: result.summary.b.accuracy }, rootRechecks: Object.keys(result.state.rechecks).length, unresolved: result.summary.provisional, moves };
});
await fs.writeFile(new URL('model-comparison.json', root), JSON.stringify({ note: 'Same recorded native mainline evidence, rescored without rerunning Stockfish. v1 is the former formula, not a contemporaneous v1 engine run. Root-refinement changes shown separately. No target-site scores used.', comparisons }, null, 2) + '\n');
const groups = [...new Set(benchmark.results.map(result => result.name))].map(name => {
  const results = benchmark.results.filter(result => result.name === name);
  const sides = Object.fromEntries(['w', 'b'].map(color => {
    const scores = results.map(result => result.summary[color].accuracy).filter(Number.isFinite);
    return [color, { min: scores.length ? Math.min(...scores) : null, max: scores.length ? Math.max(...scores) : null, range: scores.length ? Math.max(...scores) - Math.min(...scores) : null }];
  }));
  const labelChanges = results.length < 2 ? [] : Object.keys(results[0].state.records).filter(ply => new Set(results.map(result => result.state.records[ply]?.type)).size > 1).map(Number);
  return { fixture: name, qualities: results.map(result => result.quality), accuracyRanges: sides, pliesWithLabelChanges: labelChanges, elapsedMs: results.map(result => ({ quality: result.quality, ms: result.elapsedMs })) };
});
const suites = [];
for (const suite of ['browser', 'engine-browser', 'crossbrowser', 'production-browser']) {
  const report = await load(`../${suite}-results.json`), environment = await load(`../${suite}-environment.json`);
  await fs.copyFile(new URL(`../${suite}-results.json`, root), new URL(`final-${suite}-results.json`, root));
  await fs.copyFile(new URL(`../${suite}-environment.json`, root), new URL(`final-${suite}-environment.json`, root));
  suites.push({ suite, stats: report.stats, errors: report.errors.length, sourceSha256: environment.source.sha256, finalSourceSha256: environment.finalSourceSha256, sourceUnchanged: environment.sourceUnchanged, executionGaps: environment.executionGaps });
}
await fs.copyFile(new URL('../unit-results.json', root), new URL('final-unit-results.json', root));
const summary = { generatedAt: new Date().toISOString(), nativeFixtureCount: groups.length, nativeReviewRuns: benchmark.results.length, suites, variability: groups, limits: ['Reference parity is checked against pinned-source transliteration and explicit numeric fixtures, not an executed Scala runtime.', 'The historical prefix is an existing reference regression, not an independent held-out game corpus.', 'Finite scenario coverage does not establish every possible chess scenario.', 'No Elo calibration dataset, account-strength validation, tablebase proof or Chess.com percentage parity is claimed.'] };
await fs.writeFile(new URL('summary.json', root), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
