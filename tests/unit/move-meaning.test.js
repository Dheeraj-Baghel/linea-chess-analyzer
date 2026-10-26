import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { parseGame, toUci } from '../../src/chess.js';
import { moveMeaning, replayEvidenceLine, EXPLANATION_LIMITS } from '../../src/moveMeaning.js';
import { moveExplanation, accuracySummary, reviewCategoryCounts } from '../../src/review.js';
import { reviewTerminalEvaluation } from '../../src/reviewPolicy.js';

// Synthetic evidence is for logical invariants, never provider equivalence.
// Integration tests separately obtain actual searches from shipped Stockfish.
function fixture(fen, san, response = [], patch = {}) {
  const board = new Chess(fen), raw = board.move(san), move = { ...raw, uci: toUci(raw), number: Number(raw.before.split(' ')[5]) };
  const ucis = []; for (const reply of response) ucis.push(toUci(board.move(reply)));
  const record = { type: 'best', loss: 0, before: { cp: 0, depth: 16, pv: [move.uci], mate: null, fen: move.before }, after: { cp: 0, depth: 16, pv: ucis, mate: null, fen: move.after }, ...patch };
  return { move, record, explanation: moveExplanation(move, record) };
}
const kinds = explanation => explanation.facts.map(fact => fact.kind);
const forkFen = '2q3k1/8/8/5N2/8/8/8/6K1 w - - 0 1';
function mirror(fen) {
  const b = new Chess(fen), c = new Chess(); c.clear();
  for (const piece of b.board().flat().filter(Boolean)) c.put({ type: piece.type, color: piece.color === 'w' ? 'b' : 'w' }, piece.square[0] + (9 - Number(piece.square[1])));
  const fields = c.fen().split(' '); fields[1] = b.turn() === 'w' ? 'b' : 'w'; return fields.join(' ');
}

describe('exact observable move facts', () => {
  for (const [fen, move] of [['7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', 'Qg7#'], ['8/8/8/8/8/6k1/5q2/7K b - - 0 1', 'Qg2#']]) it(`recognizes actual ${move} checkmate, not a recorded result`, () => {
    const f = fixture(fen, move); expect(kinds(f.explanation)).toContain('checkmate'); expect(f.explanation.reason).toContain('no legal reply');
  });
  it('does not equate resignation/timeout metadata with checkmate', () => {
    const game = parseGame('[Result "1-0"]\n[Termination "Time forfeit"]\n\n1. e4 1-0'), move = game.moves[0];
    const record = { type: 'best', loss: 0, before: { cp: 0, depth: 16, pv: ['e2e4'] }, after: { cp: 0, depth: 16, pv: [] } };
    expect(kinds(moveMeaning(move, record, { game, ply: 1 }))).not.toContain('checkmate');
  });
  it('describes stalemate with the actual no-check/no-legal-move conditions', () => {
    const f = fixture('7k/5K2/8/6Q1/8/8/8/8 w - - 0 1', 'Qg6');
    expect(kinds(f.explanation)).toContain('stalemate'); expect(f.explanation.reason).toContain('not in check');
  });
  for (const [san, piece] of [['a8=Q+', 'queen'], ['a8=N', 'knight'], ['a8=R+', 'rook'], ['a8=B', 'bishop']]) it(`describes ${piece} promotion without inventing the purpose of underpromotion`, () => {
    const f = fixture('7k/P7/8/8/8/8/8/6K1 w - - 0 1', san);
    const fact = f.explanation.facts.find(fact => fact.kind === 'promotion'); expect(fact.text).toContain(piece); expect(fact.text.includes('underpromotion')).toBe(piece !== 'queen');
    expect(fact.text).not.toMatch(/avoids|wins|best/);
  });
  for (const [fen, san, king, rook] of [['4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'O-O', 'e1 to g1', 'h1 to f1'], ['r3k2r/8/8/8/8/8/8/4K3 b kq - 0 1', 'O-O-O', 'e8 to c8', 'a8 to d8']]) it(`describes actual ${san} king and rook movement without promising safety`, () => {
    const f = fixture(fen, san), fact = f.explanation.facts.find(item => item.kind === 'castling'); expect(fact.text).toContain(king); expect(fact.text).toContain(rook); expect(f.explanation.body).not.toMatch(/king safe|safety|protects the king/);
  });
  it('computes the only-legal-move fact instead of trusting the label or count in the record', () => {
    const f = fixture('7k/5K2/6R1/8/8/8/8/8 b - - 0 1', 'Kh7'); expect(kinds(f.explanation)).toContain('only-legal-move');
    const game = parseGame('1. e4 *'), record = { type: 'forced', legalMovesCount: 1, loss: 0, before: { cp: 0, depth: 16, pv: [] }, after: { cp: 0, depth: 16, pv: [] } };
    expect(kinds(moveMeaning(game.moves[0], record))).not.toContain('only-legal-move');
  });
  it('requires actual history for recapture and repetition claims', () => {
    const game = parseGame('1. e4 d5 2. exd5 Qxd5 *'), move = game.moves[3];
    const record = { type: 'good', loss: 1.5, before: { cp: 0, depth: 16, pv: [move.uci] }, after: { cp: 0, depth: 16, pv: [] } };
    expect(kinds(moveMeaning(move, record, { game, ply: 4 }))).toContain('recapture'); expect(kinds(moveMeaning(move, record))).not.toContain('recapture');
    const repeated = parseGame('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *'), last = repeated.moves.at(-1);
    const ev = { ...record, after: { cp: 0, depth: 16, pv: [], claims: { threefold: true } } };
    expect(kinds(moveMeaning(last, ev, { game: repeated, ply: 8 }))).toContain('draw-claim');
    expect(kinds(moveMeaning(last, ev))).not.toContain('draw-claim');
  });
  it('establishes fivefold repetition from the full history, not an exact flag in standalone evidence', () => {
    const game = parseGame('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. Nf3 Nf6 6. Ng1 Ng8 7. Nf3 Nf6 8. Ng1 Ng8 *'), move = game.moves.at(-1);
    const record = { type: 'best', loss: 0, before: { cp: 0, depth: 16, pv: [] }, after: { cp: 0, depth: 0, pv: [], exact: true, reason: 'fivefold-repetition' } };
    expect(kinds(moveMeaning(move, record, { game, ply: 16 }))).toContain('fivefold-repetition');
    expect(kinds(moveMeaning(move, record))).not.toContain('fivefold-repetition');
  });
  it('separates automatic seventy-five-move draws and fifty-move claim availability', () => {
    for (const [count, kind] of [[99, 'draw-claim-fifty'], [149, 'seventy-five-move-rule']]) {
      const f = fixture(`7k/8/8/8/8/8/8/R5K1 w - - ${count} 51`, 'Ra2'); expect(kinds(f.explanation)).toContain(kind);
    }
  });
  it('describes en passant using the captured pawn square, not an occupied destination that never existed', () => {
    const f = fixture('7k/8/8/3pP3/8/8/8/6K1 w - d6 0 2', 'exd6');
    const fact = f.explanation.facts.find(item => item.kind === 'capture');
    expect(fact.text).toContain('pawn on d5 en passant, landing on d6'); expect(fact.evidence.capturedSquare).toBe('d5');
  });
  it('basic development and central occupancy are observations, not assigned quality', () => {
    const game = parseGame('1. Nf3 *'), move = game.moves[0], record = { type: 'mistake', loss: 8, before: { cp: 0, depth: 16, pv: ['e2e4'] }, after: { cp: -80, depth: 16, pv: [] } };
    const meaning = moveMeaning(move, record);
    expect(kinds(meaning)).toContain('development'); expect(meaning.reason).not.toContain('best'); expect(record.type).toBe('mistake');
  });
});

describe('supported tactics, not geometric or endpoint guesses', () => {
  for (const [fen, san, response, color] of [[forkFen, 'Ne7+', ['Kf7', 'Nxc8'], 'White'], [mirror(forkFen), 'Ne2+', ['Kf2', 'Nxc1'], 'Black']]) it(`${color}: supports a checking fork only after inspecting legal answers and captures`, () => {
    const f = fixture(fen, san, response), fork = f.explanation.facts.find(fact => fact.kind === 'checking-fork');
    expect(fork).toBeTruthy(); expect(fork.evidence.legalCheckReplies).toBeGreaterThan(1); expect(fork.evidence.allAllowCapture).toBe(true);
    expect(f.explanation.reason).toContain('attacks the queen'); expect(f.explanation.reason).toContain('calculated line');
    expect(f.explanation.reason).not.toMatch(/guaranteed|wins the queen|forced win/);
  });
  it('rejects the same-looking checking fork when the checking knight can be captured', () => {
    const f = fixture('2q1r1k1/8/8/5N2/8/8/8/6K1 w - - 0 1', 'Ne7+', ['Kf7', 'Nxc8']);
    expect(kinds(f.explanation)).not.toContain('checking-fork'); expect(f.explanation.reason).not.toContain('attacks the queen');
  });
  it('does not turn an ordinary double attack into a verified fork without the supported continuation', () => {
    const f = fixture(forkFen, 'Ne7+', ['Kh8']); expect(kinds(f.explanation)).not.toContain('checking-fork');
  });
  it('a defended capture is a capture, not a material win', () => {
    const f = fixture('3qk3/8/8/3p4/8/8/8/3Q2K1 w - - 0 1', 'Qxd5', ['Qxd5'], { type: 'blunder', loss: 60 });
    expect(f.explanation.facts.find(fact => fact.kind === 'calculated-captures').text).toContain('queen');
    expect(f.explanation.reason).toContain('not established');
    expect(f.explanation.body).not.toMatch(/wins material|wins a pawn|hanging|undefended/);
    expect(f.explanation.facts.find(fact => fact.kind === 'calculated-captures').evidence.lastingGainClaimed).toBe(false);
  });
  it('reads a later recapture beyond the initial displayed segment, with no endpoint-win claim', () => {
    const f = fixture('3q2k1/p2r4/8/8/8/8/P7/3R2K1 w - - 0 1', 'Rxd7', ['Kh8', 'a3', 'Kg8', 'a4', 'Kh8', 'Kh2', 'Kg8', 'Kh3', 'Kh8', 'a5', 'Kg8', 'Kh2', 'Qxd7']);
    expect(f.explanation.response.at(-1).uci).toBe('d8d7'); expect(f.explanation.line.at(-1).uci).toBe('d8d7');
    expect(f.explanation.line.length).toBeGreaterThan(EXPLANATION_LIMITS.displayPlies);
    expect(f.explanation.body).not.toMatch(/wins material|wins a rook|lasting gain/);
  });
  it('explicitly identifies a truncated exchange with a legal recapture still available', () => {
    const f = fixture('3r2k1/8/8/8/8/8/8/3RK3 w - - 0 1', 'Rd2', ['Rxd2']);
    expect(kinds(f.explanation)).toContain('unresolved-exchange');
    expect(f.explanation.facts.find(fact => fact.kind === 'unresolved-exchange').text).toContain('legal recapture');
    expect(f.explanation.body).not.toMatch(/wins material|free rook/);
  });
  it('keeps provisional/unstable forks cautious and uses an honest quiet-move fallback', () => {
    const f = fixture(forkFen, 'Ne7+', ['Kf7', 'Nxc8'], { provisional: true });
    expect(kinds(f.explanation)).not.toContain('checking-fork'); expect(f.explanation.provisional).toBe(true); expect(f.explanation.body).not.toContain('Provisional');
    const q = fixture('7k/7p/8/8/8/8/8/R5K1 w - - 0 1', 'Ra2');
    expect(q.explanation.reason).toContain('The engine prefers this move'); expect(q.explanation.body).not.toContain('other moves may be close');
  });
});

describe('evidence identity and root handling', () => {
  it('normalizes restricted-root played PVs once, preferring refined evidence', () => {
    const f = fixture(forkFen, 'Ne7+', ['Kh8']);
    const pv = ['f5e7', 'g8f7', 'e7c8'];
    const record = { ...f.record, comparisonAfter: { cp: 0, depth: 18, kind: 'restricted-root', fen: f.move.before, pv }, comparisonBefore: { cp: 0, depth: 18, fen: f.move.before, pv } };
    const meaning = moveMeaning(f.move, record);
    expect(meaning.line.map(move => move.uci)).toEqual(pv); expect(meaning.response[0].uci).toBe('g8f7'); expect(meaning.line.filter(move => move.uci === 'f5e7')).toHaveLength(1);
    expect(kinds(meaning)).toContain('checking-fork');
  });
  it('same-as-best refined evidence uses the same root semantics', () => {
    const f = fixture(forkFen, 'Ne7+', ['Kh8']); f.record.comparisonAfter = { cp: 0, depth: 18, kind: 'same-as-best', sameAsBest: true, fen: f.move.before, pv: ['f5e7', 'g8f7', 'e7c8'] };
    expect(moveMeaning(f.move, f.record).response[0].uci).toBe('g8f7');
  });
  it('stops a legal engine line at exact terminal material rather than displaying post-draw filler moves', () => {
    const f = fixture(forkFen, 'Ne7+', ['Kf7', 'Nxc8', 'Ke6', 'Nb6']);
    expect(f.explanation.response.map(item => item.uci)).toEqual(['g8f7', 'e7c8']);
    expect(kinds(f.explanation)).toContain('checking-fork');
  });
  it('invalid refined played evidence never silently reuses the older after-position line', () => {
    const f = fixture(forkFen, 'Ne7+', ['Kf7', 'Nxc8']); f.record.comparisonAfter = { cp: 0, depth: 18, fen: f.move.before, pv: ['f5d6'] };
    const meaning = moveMeaning(f.move, f.record); expect(meaning.response).toEqual([]); expect(meaning.warnings).toHaveLength(1); expect(kinds(meaning)).not.toContain('checking-fork');
  });
  it('rejects stale roots/generations, a changed played move and mismatched after-position', () => {
    const f = fixture(forkFen, 'Ne7+', ['Kf7']);
    expect(moveMeaning(f.move, { ...f.record, before: { ...f.record.before, fen: f.move.after } })).toBeNull();
    expect(moveMeaning({ ...f.move, after: f.move.before }, f.record)).toBeNull();
    const record = { ...f.record, provenance: { generationId: 'old', uci: f.move.uci, color: 'w' } };
    expect(moveMeaning(f.move, record, { generationId: 'new' })).toBeNull();
    expect(moveMeaning(f.move, { ...record, provenance: { ...record.provenance, uci: 'f5d6' } })).toBeNull();
  });
  it('rejects a stale UCI position command even when the PV happens to be legal', () => {
    const f = fixture(forkFen, 'Ne7+', ['Kf7']); f.record.after.position = `position fen ${f.move.before}`;
    expect(moveMeaning(f.move, f.record)).toBeNull();
  });
  it('rejects illegal/duplicated/malformed PVs and handles missing lines without invented moves', () => {
    const game = parseGame('1. e4 *'), move = game.moves[0], base = { type: 'best', loss: 0, before: { cp: 0, depth: 16, pv: [move.uci] } };
    for (const pv of [[], null, ['e2e4'], ['e7e5', 'e2e4'], ['garbage'], [null]]) {
      const meaning = moveMeaning(move, { ...base, after: { cp: 0, depth: 16, pv } });
      expect(meaning.response).toEqual([]); expect(meaning.line.map(move => move.uci)).toEqual(['e2e4']);
    }
  });
  it('marks a bounded long PV as capped, never implying the endpoint is a stable material verdict', () => {
    const game = parseGame('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *');
    const result = replayEvidenceLine(game.initialFen, game.moves.map(move => move.uci), 3);
    expect(result.capped).toBe(true); expect(result.moves).toHaveLength(3); expect(EXPLANATION_LIMITS.pvPlies).toBe(24);
  });
  it('does not mutate original PGN, records, accuracy or classifications while explaining', () => {
    const game = parseGame('1. d4 d5 *'), move = game.moves[0];
    const record = { type: 'good', loss: 2, before: { cp: 40, depth: 16, pv: ['e2e4'] }, after: { cp: 20, depth: 16, pv: ['d7d5', 'c2c4'] } };
    const records = { 1: record }, saved = JSON.stringify({ game, records }), accuracy = accuracySummary(game, records), counts = reviewCategoryCounts(game, records);
    for (let i = 0; i < 5; i++) moveExplanation(move, record, { game, ply: 1 });
    expect(JSON.stringify({ game, records })).toBe(saved); expect(accuracySummary(game, records)).toEqual(accuracy); expect(reviewCategoryCounts(game, records)).toEqual(counts);
  });
  it('a rules check is independent of unrelated recorded results', () => {
    expect(reviewTerminalEvaluation(new Chess(forkFen))).toBeNull();
  });
});
