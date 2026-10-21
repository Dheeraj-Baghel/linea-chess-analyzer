import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { advantage, classify, createSample, DEFAULT_POSITION, gameFromFen, materialInfo, moveLabel, parseGame, positionChess, pvToSan, SAMPLE_PGN, scoreText, timeControl, toUci, uciMove } from '../../src/chess.js';

const annotated = `[Event "Preservation test"]
[White "Alice"]
[Black "Bob"]
[WhiteElo "1500"]
[BlackElo "1600"]
[Result "*"]
[TimeControl "300+3"]

1.e4 {central space [%clk 0:05:01]} (1.d4 {alternative [%clk 0:04:00]} d5) e5 {[%clk 0:04:59]} 2.Nf3! $1 Nc6 {[%eval 0.25]} *`;

describe('game parsing and preserved data', () => {
  it('loads the complete illustrative game with real legal positions', () => {
    const game = createSample();
    expect(game.isSample).toBe(true);
    expect(game.moves).toHaveLength(40);
    expect(game.positions).toHaveLength(41);
    expect(game.initialFen).toBe(DEFAULT_POSITION);
    expect(game.moves[28].san).toBe('a4');
    expect(game.moves[39].san).toBe('Qe7');
    expect(game.headers.White).toBe('Alex Morgan');
    expect(game.headers.WhiteElo).toBe('1842');
  });
  it('stores the original imported PGN verbatim apart from surrounding whitespace', () => {
    const game = parseGame(`\n ${annotated} \n`);
    expect(game.rawPgn).toBe(annotated);
    expect(game.moves.map(move => move.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(game.headers.TimeControl).toBe('300+3');
  });
  it('reads mainline clocks without taking clocks from variations', () => {
    const game = parseGame(annotated);
    expect(game.moves[0].clock).toBe('0:05:01');
    expect(game.moves[1].clock).toBe('0:04:59');
    expect(game.moves[2].clock).toBeNull();
    expect(game.moves[0].comment).toBe('central space');
    expect(game.moves[3].comment).toBe('');
  });
  it('ignores nested variations, NAGs and line comments for mainline clock association', () => {
    const game = parseGame('1. e4 (1. d4 (1. c4) d5) e5 ; ignored line\n2. Nf3 $1 {[%clk 0:04:20]} Nc6 *');
    expect(game.moves).toHaveLength(4);
    expect(game.moves[2].clock).toBe('0:04:20');
  });
  it('supports a FEN-start PGN beginning with Black and a non-first move number', () => {
    const fen = '7k/8/8/8/8/8/8/K7 b - - 0 34';
    const game = parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n[Result "*"]\n\n34... Kh7 {[%clk 0:01:02]} 35. Ka2 *`);
    expect(game.initialFen).toBe(fen);
    expect(game.moves[0].color).toBe('b');
    expect(game.moves[0].number).toBe(34);
    expect(game.moves[0].clock).toBe('0:01:02');
  });
  it('rejects illegal mainline moves', () => expect(() => parseGame('1. e5 e4 *')).toThrow());
  it('rejects invalid FEN without changing a previous game', () => {
    const game = createSample();
    expect(() => gameFromFen('not a position')).toThrow();
    expect(game.rawPgn).toBe(SAMPLE_PGN);
  });
  it('creates an exportable FEN-position game', () => {
    const game = gameFromFen('7k/8/8/8/8/8/6P1/K7 w - - 0 1');
    expect(game.moves).toEqual([]);
    expect(game.headers.FEN).toBe(game.initialFen);
    expect(game.rawPgn).toContain('[SetUp "1"]');
    expect(game.rawPgn).toContain('[FEN "');
    expect(parseGame(game.rawPgn).initialFen).toBe(game.initialFen);
  });
  it('navigation always reconstructs an exact recorded position', () => {
    const game = createSample();
    for (let ply = 0; ply <= game.moves.length; ply++) expect(positionChess(game, ply, null, 0).fen()).toBe(game.positions[ply]);
  });
  it('variation reconstruction preserves original moves and original PGN', () => {
    const game = createSample(), original = JSON.stringify(game);
    const variation = { basePly: 0, moves: [{ uci: 'd2d4' }, { uci: 'd7d5' }, { uci: 'c2c4' }] };
    expect(positionChess(game, 0, variation, 3).history()).toEqual(['d4', 'd5', 'c4']);
    expect(positionChess(game, 0, variation, 0).fen()).toBe(DEFAULT_POSITION);
    expect(JSON.stringify(game)).toBe(original);
  });
  it('reconstructed game retains repetition evidence', () => {
    const game = parseGame('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *');
    expect(positionChess(game, 8, null, 0).isThreefoldRepetition()).toBe(true);
  });
});

describe('chess interfaces and presentation', () => {
  it.each(['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n'])('roundtrips promotion %s', uci => expect(toUci(uciMove(uci))).toBe(uci));
  it('roundtrips a normal UCI move', () => expect(toUci(uciMove('e2e4'))).toBe('e2e4'));
  it('SAN conversion follows the current side and move number', () => {
    const moves = pvToSan(DEFAULT_POSITION, ['e2e4', 'e7e5', 'g1f3']);
    expect(moves.map(moveLabel)).toEqual(['1. e4', '1… e5', '2. Nf3']);
  });
  it('SAN conversion truncates illegal engine PVs rather than inventing moves', () => {
    expect(pvToSan(DEFAULT_POSITION, ['e2e4', 'd2d4', 'g1f3']).map(move => move.san)).toEqual(['e4']);
  });
  it('formats White-perspective cp and mate values', () => {
    expect(scoreText(null)).toBe('—');
    expect(scoreText({ cp: 0, mate: null })).toBe('0.00');
    expect(scoreText({ cp: 132, mate: null })).toBe('+1.32');
    expect(scoreText({ cp: -64, mate: null })).toBe('−0.64');
    expect(scoreText({ cp: 99900, mate: 1 })).toBe('+M1');
    expect(scoreText({ cp: -99700, mate: -3 })).toBe('−M3');
    expect(advantage({ cp: -99900, mate: -1 })).toContain('Black has forced mate in 1');
  });
  it('reports mate-zero as already checkmated rather than a future mate', () => {
    expect(advantage({ cp: -100000, mate: 0 })).toMatch(/Black.*checkmate|Black wins/i);
  });
  it('uses separate material balance for captures and promotions', () => {
    const chess = new Chess();
    expect(materialInfo(chess).label).toBe('Material is equal');
    chess.move('e4'); chess.move('d5'); chess.move('exd5');
    expect(materialInfo(chess).balance).toBe(1);
    expect(materialInfo(chess).label).toContain('White +1');
  });
  it('supports normal castling', () => {
    const game = parseGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O *');
    expect(game.moves.at(-1).flags).toContain('k');
    const chess = positionChess(game, game.moves.length, null, 0);
    expect(chess.get('g1')?.type).toBe('k'); expect(chess.get('f1')?.type).toBe('r');
  });
  it('supports an en-passant capture', () => {
    const game = parseGame('1. e4 h5 2. e5 d5 3. exd6 *');
    expect(game.moves.at(-1).flags).toContain('e');
    expect(new Chess(game.positions.at(-1)).get('d5')).toBeUndefined();
  });
  it('reports time controls and missing metadata explicitly', () => {
    expect(timeControl('600+5')).toBe('10 min + 5 sec');
    expect(timeControl('60')).toBe('1 min');
    expect(timeControl('?')).toBe('Time control not supplied');
  });
  it('classifies winning-chance loss relative to the mover color', () => {
    const before = { cp: 0, pv: ['e2e4'] }, after = { cp: -400 };
    expect(classify(before, after, { color: 'w', uci: 'd2d4' }).type).toBe('blunder');
    expect(classify(before, after, { color: 'b', uci: 'd7d5' }).loss).toBe(0);
    expect(classify(before, before, { color: 'w', uci: 'e2e4' }).type).toBe('best');
  });
});
