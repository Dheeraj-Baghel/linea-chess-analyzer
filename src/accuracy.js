// Accuracy v2: numeric quality is independent of classification and player rating.
// Adapted from lila AccuracyPercent.scala (AGPL-3.0-or-later), commit
// ea60d3bc7e9997f8f182d9dc3f3d468a036df20a; see vendor/accuracy-reference/NOTICE.md.
// Linea uses its actually evaluated initial position, not a synthetic initial CP.
export const ACCURACY_MODEL_VERSION = 'linea-accuracy-2';
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function whiteWinPercent(evaluation) {
  if (!evaluation) return null;
  let cp = evaluation.cp;
  if (evaluation.mate !== null && evaluation.mate !== undefined) {
    if (!Number.isFinite(evaluation.mate)) return null;
    // Signed zero cannot encode a winner: use explicit winner, signed CP or FEN.
    const winner = evaluation.winner || (Number.isFinite(cp) && cp !== 0 ? cp > 0 ? 'w' : 'b' : evaluation.fen ? evaluation.fen.split(' ')[1] === 'w' ? 'b' : 'w' : null);
    if (evaluation.mate === 0 && !winner) return null;
    cp = evaluation.mate === 0 ? winner === 'w' ? 1000 : -1000 : evaluation.mate > 0 ? 1000 : -1000;
  }
  if (!Number.isFinite(cp)) return null;
  return 100 / (1 + Math.exp(-0.00368208 * clamp(cp, -1000, 1000)));
}
export function chanceLoss(before, after, color) {
  const a = whiteWinPercent(before), b = whiteWinPercent(after);
  if (a === null || b === null || !['w', 'b'].includes(color)) return null;
  return Math.max(0, (a - b) * (color === 'w' ? 1 : -1));
}
export function accuracyFromLoss(loss) {
  if (!Number.isFinite(loss)) return null;
  if (loss <= 0) return 100;
  return clamp(103.1668100711649 * Math.exp(-0.04354415386753951 * loss) - 3.166924740191411 + 1, 0, 100);
}
export function standardDeviation(values) {
  if (!values.length || values.some(value => !Number.isFinite(value))) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}
export function volatilityWeights(winPercents) {
  const n = Math.max(0, winPercents.length - 1);
  if (!n) return [];
  const size = clamp(Math.floor(n / 10), 2, 8);
  const first = winPercents.slice(0, size);
  const windows = Array.from({ length: Math.max(0, Math.min(size, winPercents.length) - 2) }, () => first);
  // Scala sliding emits one partial window only when the entire list is shorter.
  if (winPercents.length < size) windows.push(winPercents);
  else for (let i = 0; i <= winPercents.length - size; i++) windows.push(winPercents.slice(i, i + size));
  return windows.slice(0, n).map(window => {
    const deviation = standardDeviation(window);
    return deviation === null ? null : clamp(deviation, 0.5, 12);
  });
}
export function aggregateAccuracy(entries) {
  const valid = entries.filter(entry => Number.isFinite(entry.accuracy) && Number.isFinite(entry.weight) && entry.weight > 0);
  if (!valid.length) return null;
  const totalWeight = valid.reduce((sum, entry) => sum + entry.weight, 0);
  const weighted = valid.reduce((sum, entry) => sum + entry.accuracy * entry.weight, 0) / totalWeight;
  // Reference scalalib Maths floors the reciprocal denominator at one.
  const harmonic = valid.length / valid.reduce((sum, entry) => sum + 1 / Math.max(1, entry.accuracy), 0);
  return (weighted + harmonic) / 2;
}
export function accuracySummary(game, records, generationId = null) {
  const sides = { w: { total: 0, reviewed: 0, scored: 0, provisional: 0, sum: 0, entries: [] }, b: { total: 0, reviewed: 0, scored: 0, provisional: 0, sum: 0, entries: [] } };
  const accepted = index => {
    const record = records[index + 1];
    return record && (!generationId || record.provenance?.generationId === generationId) ? record : null;
  };
  // Raw mainline positions determine volatility; root rechecks refine move loss,
  // without pretending their root scores are evaluations of the played board.
  const points = [whiteWinPercent(accepted(0)?.before), ...game.moves.map((_, index) => whiteWinPercent(accepted(index)?.after))];
  const weights = volatilityWeights(points), all = [];
  game.moves.forEach((move, index) => {
    const side = sides[move.color]; side.total++;
    const record = accepted(index), accuracy = accuracyFromLoss(record?.loss);
    if (accuracy === null) return;
    side.reviewed++; side.sum += accuracy;
    if (record?.provisional) side.provisional++;
    // Older loss-only test/import records have no position volatility evidence.
    // Show partial numeric scoring, never claim reference aggregation coverage.
    const weight = weights[index];
    if (weight !== null && weight !== undefined) {
      const entry = { ply: index + 1, accuracy, weight }; side.entries.push(entry); all.push(entry); side.scored++;
    }
  });
  for (const side of Object.values(sides)) {
    side.accuracy = aggregateAccuracy(side.entries);
    side.complete = side.total > 0 && side.reviewed === side.total && side.scored === side.total && !side.provisional;
  }
  const reviewed = sides.w.reviewed + sides.b.reviewed, scored = sides.w.scored + sides.b.scored;
  return { ...sides, total: game.moves.length, reviewed, scored, provisional: sides.w.provisional + sides.b.provisional, complete: game.moves.length > 0 && reviewed === game.moves.length && scored === game.moves.length && !sides.w.provisional && !sides.b.provisional, overall: aggregateAccuracy(all), weights, modelVersion: ACCURACY_MODEL_VERSION };
}
