import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { classify, parseGame, toUci } from '../../src/chess.js';
import { accuracySummary, coachingSummary, moveAccuracy, moveExplanation, sacrificeCandidate, withBrilliance } from '../../src/review.js';
import { aggregateAccuracy } from '../../src/accuracy.js';

const evaluation = (cp = 0, pv = [], depth = 16) => ({ cp, pv, depth, mate: null });
function sacrificeFixture() {
  // Original constructed smothered-mate motif: Qg8+ Rxg8 Nf7#.
  const chess = new Chess('5r1k/6pp/4Q2N/8/8/8/8/6K1 w - - 0 1');
  const move = chess.move('Qg8+');
  const model = { ...move, uci: toUci(move), number: 1 };
  const before = evaluation(300, [model.uci, 'f8g8', 'h6f7']);
  return { move: model, record: { ...classify(before, evaluation(300, ['f8g8']), model), type: 'best' } };
}

describe('transparent independent accuracy', () => {
  it('returns no score for an unreviewed or non-finite move', () => {
    expect(moveAccuracy(null)).toBeNull();
    expect(moveAccuracy({ loss: NaN })).toBeNull();
    expect(moveAccuracy({ loss: Infinity })).toBeNull();
  });
  it('computes the documented monotonic move score', () => {
    expect(moveAccuracy({ loss: 0 })).toBe(100);
    expect(moveAccuracy({ loss: 20 })).toBeCloseTo(41.016818741417126, 9);
    expect(moveAccuracy({ loss: 10 })).toBeGreaterThan(moveAccuracy({ loss: 30 }));
    expect(moveAccuracy({ loss: -3 })).toBe(100);
  });
  it('does not assign a fake perfect score to an unreviewed game', () => {
    const game = parseGame('1. e4 e5 2. Nf3 Nc6 *');
    const summary = accuracySummary(game, {});
    expect(summary.overall).toBeNull(); expect(summary.w.accuracy).toBeNull(); expect(summary.b.accuracy).toBeNull();
    expect(summary.reviewed).toBe(0); expect(summary.complete).toBe(false);
  });
  it('keeps partial coverage and separates the players', () => {
    const game = parseGame('1. e4 e5 2. Nf3 Nc6 *');
    const summary = accuracySummary(game, { 1: { loss: 0, before: evaluation(0), after: evaluation(0) }, 2: { loss: 20, before: evaluation(0), after: evaluation(0) } });
    expect(summary.reviewed).toBe(2); expect(summary.total).toBe(4);
    expect(summary.w.accuracy).toBe(100); expect(summary.b.accuracy).toBeCloseTo(moveAccuracy({ loss: 20 }));
    expect(summary.w.complete).toBe(false); expect(summary.overall).toBeCloseTo(aggregateAccuracy([{ accuracy: 100, weight: 0.5 }, { accuracy: moveAccuracy({ loss: 20 }), weight: 0.5 }]));
  });
  it('weights combined scores by actual move counts, not equally by player', () => {
    const game = parseGame('1. e4 e5 2. Nf3 *');
    const summary = accuracySummary(game, Object.fromEntries([0, 20, 0].map((loss, index) => [index + 1, { loss, before: evaluation(0), after: evaluation(0) }])));
    expect(summary.overall).toBeCloseTo(aggregateAccuracy([0, 20, 0].map(loss => ({ accuracy: moveAccuracy({ loss }), weight: 0.5 }))));
    expect(summary.complete).toBe(true); expect(summary.w.reviewed).toBe(2); expect(summary.b.reviewed).toBe(1);
  });
  it('handles a Black-start FEN game without assuming equal move counts', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/K7 b - - 0 34"]\n\n34... Kh7 *');
    const summary = accuracySummary(game, { 1: { loss: 4 } });
    expect(summary.w.total).toBe(0); expect(summary.w.accuracy).toBeNull(); expect(summary.b.reviewed).toBe(1);
  });
});

describe('conservative sacrifice evidence and Brilliant labels', () => {
  it('requires a legal accepting capture and estimates material at risk', () => {
    const { move, record } = sacrificeFixture();
    const candidate = sacrificeCandidate(move, record);
    expect(candidate).not.toBeNull(); expect(candidate.acceptance).toBe('f8g8');
    expect(candidate.offeredPiece).toBe('q'); expect(candidate.cost).toBeGreaterThanOrEqual(1.5);
    expect(new Chess(candidate.fen).get('g8')).toMatchObject({ color: 'b', type: 'r' });
  });
  it('will not classify an unvalidated sacrifice as Brilliant', () => {
    const { move, record } = sacrificeFixture(), candidate = sacrificeCandidate(move, record);
    expect(withBrilliance(record, candidate, null, move).type).toBe('best');
    expect(withBrilliance(record, candidate, evaluation(300, [], 7), move).brilliance.verified).toBe(false);
  });
  it('accepts sufficient depth and compensation from a separate capture search', () => {
    const { move, record } = sacrificeFixture(), candidate = sacrificeCandidate(move, record);
    const result = withBrilliance(record, candidate, evaluation(320, [], 16), move);
    expect(result.type).toBe('brilliant'); expect(result.brilliance.depth).toBe(16); expect(result.brilliance.explanation).toContain('Queen'.toLowerCase());
  });
  it('rejects a sacrifice if accepting it leaves the mover clearly worse', () => {
    const { move, record } = sacrificeFixture(), candidate = sacrificeCandidate(move, record);
    expect(withBrilliance(record, candidate, evaluation(-500), move).type).not.toBe('brilliant');
  });
  it('requires engine-best choice, mainline depth and low chance loss', () => {
    const { move, record } = sacrificeFixture();
    expect(sacrificeCandidate(move, { ...record, loss: 5 })).toBeNull();
    expect(sacrificeCandidate(move, { ...record, before: evaluation(300, ['e6f5']) })).toBeNull();
    expect(sacrificeCandidate(move, { ...record, after: evaluation(300, ['f8g8'], 5) })).toBeNull();
  });
  it('treats a bishop given for two pawns (Chess.com game 185626013138, 9...Bxa3) as a candidate', () => {
    const chess = new Chess('r3k2r/ppp1qppp/2n1pnb1/3p4/1b1P1B2/P1NBPN2/1PPQ1PPP/2KR3R b kq - 0 9');
    const raw = chess.move('Bxa3'), move = { ...raw, uci: toUci(raw) };
    const record = { type: 'best', loss: 0.42, before: evaluation(-162, ['b4a3'], 16), after: evaluation(-157, [], 16) };
    const candidate = sacrificeCandidate(move, record);
    expect(candidate).toMatchObject({ acceptance: 'b2a3', cost: 1, rule: 'piece-for-pawns', offeredPiece: 'b' });
    expect(withBrilliance(record, candidate, evaluation(-170, [], 16), move).type).toBe('brilliant');
  });
  it('does not treat a protected minor-piece offer for a minor piece as piece-for-pawns', () => {
    const chess = new Chess('rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3');
    const raw = chess.move('Bc4'), move = { ...raw, uci: toUci(raw) };
    const record = { type: 'best', loss: 0.2, before: evaluation(40, [move.uci], 16), after: evaluation(40, [], 16) };
    expect(sacrificeCandidate(move, record)).toBeNull();
  });
  it('does not call a routine pawn move or promotion Brilliant', () => {
    const chess = new Chess(); const raw = chess.move('e4'); const move = { ...raw, uci: toUci(raw) };
    const before = evaluation(0, [move.uci]), record = classify(before, evaluation(0), move);
    expect(sacrificeCandidate(move, record)).toBeNull();
  });
  it('does not call an equal rook trade a sacrifice', () => {
    const chess = new Chess('3r2k1/3r4/8/8/8/8/8/3R2K1 w - - 0 1');
    const raw = chess.move('Rxd7'), move = { ...raw, uci: toUci(raw) };
    const record = classify(evaluation(0, [move.uci]), evaluation(0), move);
    expect(sacrificeCandidate(move, record)).toBeNull();
  });
  it('supports exact terminal validation without inventing a reached engine depth', () => {
    const { move, record } = sacrificeFixture(), candidate = sacrificeCandidate(move, record);
    const result = withBrilliance(record, candidate, { cp: 100000, mate: 0, depth: 0, pv: [], exact: true }, move);
    expect(result.type).toBe('brilliant'); expect(result.brilliance.depth).toBe(0); expect(result.brilliance.explanation).toContain('exact terminal');
  });
});

describe('coaching grounded in reviewed moves', () => {
  it('returns no made-up coaching for an unreviewed player', () => expect(coachingSummary(parseGame('1. e4 e5 *'), {}, 'w')).toBeNull());
  it('isolates a selected player’s own mistakes and points to actual moves', () => {
    const game = parseGame('[White "Alice"]\n[Black "Bob"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
    const records = {
      1: { type: 'inaccuracy', loss: 4, before: evaluation(0, ['e2e4']), after: evaluation(-50, ['e7e5']) },
      2: { type: 'best', loss: 0, before: evaluation(-50, ['e7e5']), after: evaluation(-100, ['g2g4']) },
      3: { type: 'blunder', loss: 80, before: evaluation(-100, ['e2e4']), after: { cp: -99900, mate: -1, depth: 16, pv: ['d8h4'] } },
      4: { type: 'best', loss: 0, before: { cp: -99900, mate: -1, depth: 16, pv: ['d8h4'] }, after: { cp: -100000, mate: 0, depth: 0, pv: [] } },
    };
    const white = coachingSummary(game, records, 'w'), black = coachingSummary(game, records, 'b');
    expect(white.name).toBe('Alice'); expect(white.critical.map(item => item.ply)).toEqual([3, 1]);
    expect(white.headline).toContain('forcing replies'); expect(white.drill).toContain('checks');
    expect(black.name).toBe('Bob'); expect(black.critical).toHaveLength(0); expect(black.strength).toContain('2 of your 2');
  });
  it('describes only legal engine continuations and alternatives', () => {
    const game = parseGame('1. d4 d5 *'), move = game.moves[0];
    const record = { type: 'good', loss: 2, before: evaluation(40, ['e2e4', 'e7e5', 'g1f3']), after: evaluation(20, ['d7d5', 'c2c4']) };
    const explanation = moveExplanation(move, record);
    expect(explanation.alternative.san).toBe('e4'); expect(explanation.response[0].san).toBe('d5'); expect(explanation.accuracy).toBeCloseTo(92.39537613024598);
  });
  it('does not invent a reply when the PV is illegal', () => {
    const move = parseGame('1. e4 *').moves[0];
    const explanation = moveExplanation(move, { type: 'best', loss: 0, before: evaluation(0, ['e2e4']), after: evaluation(0, ['e2e4']) });
    expect(explanation.response).toEqual([]); expect(explanation.body).not.toContain('can respond');
  });
});
