import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { parseGame, toUci } from '../../src/chess.js';
import { moveExplanation } from '../../src/review.js';
import { moveEffects } from '../../src/moveEffects.js';

// Synthetic accepted evidence isolates explanatory logic. Native browser tests
// independently run Stockfish. No target category totals/percentages in production.
function recordFor(move, { type = 'best', preferred = [move.uci], response = [], provisional = false } = {}) {
  return { type, loss: ['inaccuracy', 'mistake', 'blunder', 'miss'].includes(type) ? 5 : 0, provisional,
    before: { cp: 0, depth: 16, pv: preferred, fen: move.before }, after: { cp: 0, depth: 16, pv: response, fen: move.after } };
}
function fixture(fen, san, response = [], preferredSan, type = 'best') {
  const board = new Chess(fen), raw = board.move(san), move = { ...raw, uci: toUci(raw), number: Number(raw.before.split(' ')[5]) };
  const pv = response.map(san => toUci(board.move(san)));
  const other = new Chess(fen), preferred = preferredSan ? [toUci(other.move(preferredSan))] : [move.uci];
  const record = recordFor(move, { response: pv, preferred, type });
  return { move, record, explanation: moveExplanation(move, record) };
}
const sentences = text => text.match(/[.!?](?:\s|$)/g)?.length || 0;

describe('position-specific opening ideas, not quality claims', () => {
  it('central pawn advance opens actual bishop/queen diagonals with explicit fact provenance', () => {
    const g = parseGame('1. e4 *'), move = g.moves[0], explanation = moveExplanation(move, recordFor(move));
    expect(explanation.body).toMatch(/space in the centre.*diagonals.*bishop/); expect(explanation.body).toContain('queen');
    expect(explanation.body).not.toMatch(/Stockfish prefers|recorded search depth|other moves may be close/);
    expect(explanation.selection.level).toBe('observable'); expect(explanation.selection.causalComparison).toBe(false);
    const routes = explanation.facts.find(fact => fact.kind === 'opened-routes').evidence.routes;
    expect(routes.some(route => route.from === 'f1' && route.squares.includes('e2'))).toBe(true);
    expect(routes.some(route => route.from === 'd1' && route.squares.includes('e2'))).toBe(true);
    expect(sentences(explanation.body)).toBeLessThanOrEqual(2);
  });
  it('different starting pawn moves produce different verified routes and copy', () => {
    const d = parseGame('1. d4 *').moves[0], e = parseGame('1. e4 *').moves[0];
    const dx = moveExplanation(d, recordFor(d)), ex = moveExplanation(e, recordFor(e));
    expect(dx.body).not.toBe(ex.body); expect(dx.body).not.toContain('diagonals for your queen');
    expect(dx.facts.find(fact => fact.kind === 'opened-routes').evidence.routes.some(route => route.from === 'c1')).toBe(true);
  });
  it('a recapture can develop a knight and add actual central control', () => {
    const g = parseGame('[SetUp "1"]\n[FEN "4k1n1/8/5p2/4P3/4P3/8/8/6K1 w - - 0 3"]\n\n3. exf6 Nxf6 *');
    const move = g.moves[1], x = moveExplanation(move, recordFor(move), { game: g, ply: 2 });
    expect(x.body).toContain('recover the pawn while developing your knight'); expect(x.body).toContain('From f6, it controls e4 and d5');
    expect(x.selection.kind).toBe('capture-development'); expect(sentences(x.body)).toBe(2);
    expect(x.facts.find(fact => fact.kind === 'central-control').evidence.legalDestinations).toEqual(['e4', 'd5']);
  });
  it('development plus newly controlled squares is generated from the board', () => {
    const m = parseGame('1. Nf3 *').moves[0], x = moveExplanation(m, recordFor(m));
    expect(x.body).toContain('develop your knight'); expect(x.body).toContain('d4 and e5'); expect(x.body).not.toContain('best');
  });
  it('castling adds only actual rook activation, not generic king safety', () => {
    const f = fixture('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'O-O');
    expect(f.explanation.body).toContain('rook from h1 to f1'); expect(f.explanation.body).not.toMatch(/safe|protects/);
    expect(f.explanation.facts.some(fact => fact.kind === 'rook-activation')).toBe(true);
  });
  it('a pawn can block a specific bishop route rather than receive a generic centre story', () => {
    const f = fixture('7k/8/8/8/2P5/8/8/3B2K1 w - - 0 1', 'c5');
    const effects = moveEffects(f.move, new Chess(f.move.before), new Chess(f.move.after));
    expect(effects.blocked.some(route => route.from === 'd1' && route.blockedAt === 'c5')).toBe(false);
    // On the actual diagonal, d2-d3 blocks the b1-c2-d3-e4 route.
    const g = fixture('7k/8/8/8/8/8/3P4/1B4K1 w - - 0 1', 'd3');
    expect(g.explanation.facts.find(fact => fact.kind === 'blocked-routes').evidence.routes[0].from).toBe('b1');
    expect(g.explanation.body).toContain('pawn on d3 blocks');
  });
});

describe('causal comparison determines relevance', () => {
  it('5...e6 never attributes a later equal bishop/knight exchange to the inaccuracy', () => {
    const g = parseGame('1. e4 Nc6 2. Nf3 Nf6 3. Nc3 d6 4. Bb5 Bd7 5. d3 e6 6. O-O Be7 7. Re1 O-O 8. Bxc6 Bxc6 *'), move = g.moves[9];
    const record = recordFor(move, { type: 'inaccuracy', preferred: ['e7e5'], response: g.moves.slice(10).map(move => move.uci) });
    const x = moveExplanation(move, record, { game: g, ply: 10 });
    expect(x.body).toBe('The engine prefers e5 here. Compare the two continuations to see the difference.');
    expect(x.body).not.toMatch(/Bxc6|captures|loss|gives up/); expect(x.selection.causalComparison).toBe(false);
    expect(x.supportingFactIds).not.toContain('calculated-captures');
    expect(x.facts.find(fact => fact.kind === 'calculated-captures').evidence.causalReasonEstablished).toBe(false);
  });
  it('an equal immediate exchange is not a material loss or a causal explanation', () => {
    const f = fixture('3r2k1/8/8/8/8/8/3R4/3Q2K1 w - - 0 1', 'Rd7', ['Rxd7', 'Qxd7'], 'Rc2', 'inaccuracy');
    expect(f.explanation.selection.causalComparison).toBe(false); expect(f.explanation.body).toContain('Compare the two');
    expect(f.explanation.body).not.toMatch(/allows|taken|material|loses/);
  });
  it('a demonstrated immediate queen loss contrasts with the same-root alternative', () => {
    const f = fixture('3qk3/8/8/3p4/8/8/8/3Q2K1 w - - 0 1', 'Qxd5', ['Qxd5'], 'Qh5+', 'blunder');
    expect(f.explanation.body).toContain('queen on d5 to be taken'); expect(f.explanation.body).toContain('Qh5+ avoids');
    const fact = f.explanation.facts.find(f => f.kind === 'immediate-capture-comparison');
    expect(fact.level).toBe('comparative'); expect(fact.evidence.root).toBe(f.move.before); expect(fact.evidence.localExchangeGain).toBeGreaterThan(0);
    expect(sentences(f.explanation.body)).toBe(2);
  });
  it('an irrelevant future mate is not automatically attributed to the current move', () => {
    const f = fixture('3q2k1/p2r4/8/8/8/8/P7/3R2K1 w - - 0 1', 'Rxd7', ['Kh8', 'Kh1', 'Kg8', 'Kh2', 'Kh8', 'Kh3', 'Qxd7'], 'Rc1', 'inaccuracy');
    expect(f.explanation.selection.causalComparison).toBe(false); expect(f.explanation.body).not.toContain('capturing');
  });
  it('a board difference in development is visible in Explain but never proves an inaccuracy', () => {
    const g = parseGame('1. a3 *'), move = g.moves[0], x = moveExplanation(move, recordFor(move, { type: 'inaccuracy', preferred: ['g1f3'] }));
    expect(x.body).toBe('The engine prefers Nf3 here. Compare the two continuations to see the difference.');
    expect(x.facts.some(fact => fact.kind === 'development-difference')).toBe(true);
    expect(x.supportingFactIds).not.toContain('development-difference');
  });
  it('provisional evidence does not turn a board benefit into a confident causal verdict', () => {
    const g = parseGame('1. e4 *'), move = g.moves[0], x = moveExplanation(move, recordFor(move, { type: 'inaccuracy', preferred: ['d2d4'], provisional: true }));
    expect(x.provisional).toBe(true); expect(x.body).not.toContain('Provisional'); expect(x.body).toContain('Compare the two');
  });
  it('same-root immediate mate avoidance is a supported comparative reason', () => {
    const g = parseGame('1. f3 e5 2. g4 Qh4# 0-1'), move = g.moves[2];
    const x = moveExplanation(move, recordFor(move, { type: 'blunder', preferred: ['g2g3'], response: ['d8h4'] }), { game: g, ply: 3 });
    expect(x.body).toContain('allows checkmate on the next reply'); expect(x.body).toContain('g3 avoids'); expect(x.selection.causalComparison).toBe(true);
  });
});
