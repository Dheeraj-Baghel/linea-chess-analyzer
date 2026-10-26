import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { accuracyFromLoss, accuracySummary, aggregateAccuracy, chanceLoss, standardDeviation, volatilityWeights, whiteWinPercent } from '../../src/accuracy.js';
import { classify, parseGame, toUci } from '../../src/chess.js';
import { reviewTerminalEvaluation, ruleDrawClaims } from '../../src/reviewPolicy.js';
import { GAME_RATING_VERSION, PERFORMANCE_CAP, PERFORMANCE_SCALE, RATING_PROVENANCE, experimentalGameRatings, performanceEstimate, reviewExport, timeClass } from '../../src/gameRating.js';
import { bookMoveEvidence } from '../../src/reviewBook.js';

const ev = (cp, mate = null) => ({ cp, mate, depth: 16, pv: [] });
// Independent reference transliteration: fixed input array, same float tolerance
// established in WORKLOG before tests. No engine scores are simulated as native.
function referenceWeights(values) {
  const n = values.length - 1, size = Math.min(8, Math.max(2, Math.floor(n / 10)));
  const windows = [];
  for (let i = 0; i < Math.min(size, values.length) - 2; i++) windows.push(values.slice(0, size));
  if (values.length < size) windows.push(values);
  else for (let i = 0; i + size <= values.length; i++) windows.push(values.slice(i, i + size));
  return windows.map(window => {
    if (window.some(v => v === null)) return null;
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    return Math.min(12, Math.max(0.5, Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length)));
  });
}

describe('pinned accuracy v2 deterministic reference', () => {
  for (const [loss, output] of [[0, 100], [1, 96.60397651008962], [5, 80.81529992041436], [10, 64.57982845372067], [20, 41.016818741417126], [40, 15.909002002130045], [100, 0]]) it(`matches reference move loss ${loss}`, () => expect(accuracyFromLoss(loss)).toBeCloseTo(output, 9));
  for (const cp of [-5000, -1000, -300, 0, 300, 1000, 5000]) it(`converts and mirrors ${cp} cp`, () => {
    const expected = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1);
    expect(whiteWinPercent(ev(cp))).toBeCloseTo(expected, 9);
    expect(whiteWinPercent(ev(cp)) + whiteWinPercent(ev(-cp))).toBeCloseTo(100, 9);
  });
  for (const n of [1, 2, 9, 20, 30, 40, 79, 80, 140]) it(`aligns ${n}-ply volatility windows with pinned reference`, () => {
    const values = Array.from({ length: n + 1 }, (_, i) => 20 + i % 7 * 8);
    expect(volatilityWeights(values)).toHaveLength(n);
    volatilityWeights(values).forEach((v, i) => expect(v).toBeCloseTo(referenceWeights(values)[i], 9));
  });
  it('keeps missing, NaN and infinite scores unavailable', () => {
    for (const score of [null, {}, ev(null), ev(NaN), ev(Infinity), ev(null, NaN)]) expect(whiteWinPercent(score)).toBeNull();
    expect(accuracyFromLoss(undefined)).toBeNull(); expect(accuracyFromLoss(null)).toBeNull();
    expect(volatilityWeights([50, null, 50])).toEqual([null, null]);
    expect(standardDeviation([])).toBeNull(); expect(aggregateAccuracy([])).toBeNull();
  });
  it('matches reference harmonic denominator floor including real zero accuracy', () => {
    expect(aggregateAccuracy([{ accuracy: 0, weight: 0.5 }, { accuracy: 100, weight: 0.5 }])).toBeCloseTo((50 + 2 / 1.01) / 2, 9);
  });
  it('all classifications preserve the same numeric score for identical loss', () => {
    for (const type of ['book', 'forced', 'brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder']) {
      const game = parseGame('1. e4 *');
      expect(accuracySummary(game, { 1: { type, loss: 20, before: ev(0), after: ev(0) } }).w.accuracy).toBeCloseTo(41.016818741417126, 9);
    }
  });
  it('counts actual Black-start mover and excludes stale generation evidence', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "7k/8/8/8/8/8/P7/K7 b - - 0 34"]\n\n34... Kh7 *');
    const record = { loss: 0, before: ev(0), after: ev(0), provenance: { generationId: 'new' } };
    const summary = accuracySummary(game, { 1: record }, 'new');
    expect(summary.b.accuracy).toBe(100); expect(summary.w.accuracy).toBeNull(); expect(summary.b.total).toBe(1);
    expect(accuracySummary(game, { 1: record }, 'old').reviewed).toBe(0);
  });
  it('marks completed search coverage with unresolved judgments as provisional', () => {
    const game = parseGame('1. e4 *'); const summary = accuracySummary(game, { 1: { loss: 10, before: ev(0), after: ev(0), provisional: true } });
    expect(summary.reviewed).toBe(1); expect(summary.complete).toBe(false); expect(summary.provisional).toBe(1);
  });
});

describe('chess scenarios and classification safety', () => {
  it('rejects an impossible non-moving king in check before starting Stockfish', () => {
    expect(() => parseGame('[SetUp "1"]\n[FEN "7k/8/6KQ/8/8/8/8/8 w - - 0 1"]\n\n1. Qg7# 1-0')).toThrow('side not to move');
  });
  it('mate zero uses the winner for both colors and never invents one', () => {
    expect(whiteWinPercent(ev(null, 0))).toBeNull();
    expect(whiteWinPercent({ ...ev(null, 0), winner: 'w' })).toBeGreaterThan(97);
    expect(whiteWinPercent({ ...ev(null, 0), winner: 'b' })).toBeLessThan(3);
  });
  for (const color of ['w', 'b']) it(`does not let a PV match conceal a ${color} losing swing`, () => {
    const game = parseGame('1. e4 e5 *'), move = game.moves.find(m => m.color === color), sign = color === 'w' ? 1 : -1;
    const result = classify({ ...ev(500 * sign), pv: [move.uci] }, ev(-500 * sign), move);
    expect(result.type).toBe('blunder'); expect(result.loss).toBeGreaterThan(70);
    expect(accuracyFromLoss(result.loss)).toBeLessThan(3);
  });
  it('mate-to-mate delays stay numerically equal without arbitrary penalties', () => {
    expect(chanceLoss(ev(null, 2), ev(null, 8), 'w')).toBe(0);
    expect(chanceLoss(ev(null, -2), ev(null, -8), 'b')).toBe(0);
    expect(chanceLoss(ev(null, 2), ev(0), 'w')).toBeGreaterThan(45);
  });
  it('known lone legal move is Forced without overriding a supplied loss', () => {
    const move = parseGame('1. e4 *').moves[0]; const result = classify(ev(300), ev(-300), move, { legalMovesCount: 1 });
    expect(result.type).toBe('forced'); expect(accuracyFromLoss(result.loss)).toBeLessThan(10);
  });
  it('Great requires gap evidence; Miss detects lost mate, not a checking capture', () => {
    const move = parseGame('1. e4 *').moves[0];
    expect(classify({ ...ev(0), pv: [move.uci] }, ev(0), move, { pvGap: 15 }).type).toBe('great');
    expect(classify({ ...ev(0), pv: [move.uci] }, ev(0), move, { pvGap: 15, provisional: true }).type).toBe('best');
    expect(classify(ev(null, 3), ev(0), move).type).toBe('miss');
  });
  it('threefold/fifty claims do not end analysis; fivefold/75 are automatic', () => {
    const chess = new Chess(); chess.loadPgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *');
    expect(ruleDrawClaims(chess).threefold).toBe(true); expect(reviewTerminalEvaluation(chess)).toBeNull();
    for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) chess.move(move);
    expect(reviewTerminalEvaluation(chess).reason).toBe('fivefold-repetition');
    expect(reviewTerminalEvaluation(new Chess('7k/8/8/8/8/8/P7/K7 w - - 100 60'))).toBeNull();
    expect(reviewTerminalEvaluation(new Chess('7k/8/8/8/8/8/P7/K7 w - - 150 80')).reason).toBe('seventy-five-move-rule');
  });
  it('checkmate precedes 75-move draw and stalemate has no invented depth', () => {
    const mate = new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 150 80');
    expect(reviewTerminalEvaluation(mate)).toMatchObject({ reason: 'checkmate', winner: 'w', depth: 0 });
    expect(reviewTerminalEvaluation(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toMatchObject({ reason: 'stalemate', cp: 0, mate: null });
  });
  for (const [name, pgn] of [
    ['castling', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O *'],
    ['en passant', '1. e4 a6 2. e5 d5 3. exd6 *'],
    ['underpromotion', '[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=N *'],
    ['Black promotion', '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/p7/7K b - - 0 34"]\n\n34... a1=Q+ *'],
  ]) it(`preserves legal ${name} history and actual colors`, () => {
    const game = parseGame(pgn), board = new Chess(game.initialFen);
    game.moves.forEach(move => { expect(toUci(board.move(move.san))).toBe(move.uci); });
    expect(board.fen()).toBe(game.positions.at(-1));
  });
  it('book uses actual dataset positions, never arbitrary FEN or first-N rules', async () => {
    const book = await bookMoveEvidence(parseGame('1. e4 e5 2. Nf3 *')); expect(book.plies.has(1)).toBe(true); expect(book.source.revision).toBeTruthy();
    const custom = parseGame('[SetUp "1"]\n[FEN "7k/8/8/8/8/8/P7/K7 w - - 0 1"]\n\n1. a4 *');
    expect((await bookMoveEvidence(custom)).plies.size).toBe(0);
  });
});

describe('experimental game Elo gating and independent inputs', () => {
  function fixture(rating) {
    const game = parseGame('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 1/2-1/2');
    if (rating) game.headers.WhiteElo = String(rating);
    // White loses 2 points per move, Black 6: a known, nonzero accuracy difference.
    const records = Object.fromEntries(game.moves.map((move, i) => [i + 1, { type: 'good', loss: move.color === 'w' ? 2 : 6, before: ev(0), after: ev(0) }]));
    return { game, review: { records, generation: { status: 'completed' } } };
  }
  it('requires enough decisions and full compatible evidence', () => {
    const { game, review } = fixture(1500);
    expect(experimentalGameRatings(game, review).w).toMatchObject({ calibrated: false, anchor: 1500, mode: 'PGN-rating-anchored relative heuristic', version: GAME_RATING_VERSION });
    expect(experimentalGameRatings(game, review).w.value).toBeGreaterThan(100);
    review.records[1].provisional = true; expect(experimentalGameRatings(game, review).w.value).toBeNull();
    expect(experimentalGameRatings(parseGame('1. f3 e5 2. g4 Qh4# 0-1'), { records: {} }).w.value).toBeNull();
  });
  it('withholds an unanchored estimate instead of inventing a scale', () => {
    const { game, review } = fixture();
    expect(experimentalGameRatings(game, review).w).toMatchObject({ value: null, anchor: null });
    expect(experimentalGameRatings(game, review).w.reason).toMatch(/rating in the PGN/);
  });
  it('rating changes do not change accuracy or classification', () => {
    const { game, review } = fixture(1500), first = accuracySummary(game, review.records);
    game.headers.WhiteElo = '2500'; expect(accuracySummary(game, review.records)).toEqual(first);
    expect(experimentalGameRatings(game, review).w.anchor).toBe(2500);
  });
  it('elo-4 is relative: own rating plus a capped accuracy-difference term', () => {
    const { game, review } = fixture(1500), w = experimentalGameRatings(game, review).w;
    const summary = accuracySummary(game, review.records);
    expect(w.accuracyDifference).toBeCloseTo(summary.w.accuracy - summary.b.accuracy, 9);
    expect(w.value).toBe(Math.round((1500 + PERFORMANCE_SCALE * w.accuracyDifference) / 10) * 10);
    // Symmetric and antisymmetric: equal play leaves the anchor unchanged, mirrored play mirrors the delta.
    expect(performanceEstimate(80, 80, 1500).value).toBe(1500);
    expect(performanceEstimate(90, 80, 1500).delta).toBe(-performanceEstimate(80, 90, 1500).delta);
    expect(performanceEstimate(100, 0, 1500)).toMatchObject({ delta: PERFORMANCE_CAP, capped: true });
    // The opponent's PGN rating and time control are recorded but never move the number.
    game.headers.BlackElo = '2600'; game.headers.TimeControl = '60';
    expect(experimentalGameRatings(game, review).w.value).toBe(w.value);
  });
  it('contains no game-specific fit or reference lookup at runtime', () => {
    expect(RATING_PROVENANCE.calibrated).toBe(false);
    expect(RATING_PROVENANCE.retiredFit.version).toBe('fit-1-game-185626013138');
    expect(JSON.stringify(experimentalGameRatings(fixture(1500).game, fixture(1500).review))).not.toMatch(/185626013138[^"]*"\s*,\s*"value"/);
    expect(timeClass('180+2')).toMatchObject({ name: 'blitz', estimatedSeconds: 260 });
    expect(timeClass('-')).toMatchObject({ name: 'unknown' });
  });
  it('exports unrounded evidence, versions, weights and original PGN', () => {
    const { game, review } = fixture(); const output = reviewExport(game, review);
    expect(output.originalPgn).toBe(game.rawPgn); expect(output.accuracy.modelVersion).toBe('linea-accuracy-2'); expect(output.records).toHaveLength(game.moves.length);
    expect(output.experimentalGameElo.w.calibrated).toBe(false); expect(output.records[0].weight).toBe(0.5);
    expect(output.schema).toBe('linea-review-evidence-3'); expect(output.versions).toMatchObject({ gameRating: GAME_RATING_VERSION, book: 'linea-book-2' });
  });
});
