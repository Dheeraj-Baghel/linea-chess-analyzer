import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { gameFromFen, parseGame } from '../../src/chess.js';
import { canDetectOpening, detectOpening, positionKey, suppliedOpening } from '../../src/openings.js';

const index = JSON.parse(fs.readFileSync('src/data/openings-index.json', 'utf8'));
const game = pgn => parseGame(pgn);

describe('F02 supplied opening metadata precedence', () => {
  it('preserves valid supplied Opening/Variation/ECO and labels their source', () => {
    const input = game('[Opening "Supplied family"]\n[Variation "Supplied branch"]\n[ECO "B20"]\n\n1. e4 e5 *');
    expect(detectOpening(input, index)).toMatchObject({ name: 'Supplied family', variation: 'Supplied branch', eco: 'B20', source: 'pgn', sourceLabel: 'Supplied PGN metadata' });
  });
  it('retains a supplied name without inventing an ECO and rejects invalid ECO', () => {
    expect(suppliedOpening(game('[Opening "My supplied opening"]\n[ECO "Z99"]\n\n1. d4 *'))).toMatchObject({ name: 'My supplied opening', eco: null });
  });
  // 22 Oct 2026 (user request): an ECO code without a name is incomplete
  // metadata; the real name comes from the local position index instead of a
  // "not supplied" placeholder. A supplied name still takes precedence.
  it('treats ECO-only headers as incomplete and resolves the name locally', () => {
    expect(suppliedOpening(game('[ECO "c60"]\n\n1. e4 *'))).toBeNull();
    expect(detectOpening(game('[ECO "D00"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 *'), index)).toMatchObject({ name: "Queen's Gambit Declined", variation: 'Normal Defense', eco: 'D35', source: 'local' });
  });
  it('falls back to local lookup for placeholder/unknown headers', () => {
    expect(detectOpening(game('[Opening "?"]\n[ECO "??"]\n\n1. e4 c5 *'), index)).toMatchObject({ name: 'Sicilian Defense', eco: 'B20', source: 'local' });
  });
});

describe('F02 pinned offline opening lookup', () => {
  it('records the reviewed CC0 revision and generated schema', () => {
    expect(index).toMatchObject({ version: 1, license: 'CC0-1.0', revision: 'a6189a30dc273ccb21fc2536a9a2fefd5592a67a', records: 3865 });
    expect(Object.keys(index.positions)).toHaveLength(3865);
  });
  for (const [pgn, eco, name, ply] of [
    ['1. e4 c5 *', 'B20', 'Sicilian Defense', 2],
    ['1. e4 e5 2. Nf3 Nc6 3. Bb5 *', 'C60', 'Ruy Lopez', 5],
    ['1. e4 e6 *', 'C00', 'French Defense', 2],
    // Local names are split at the dataset's ":" into family + variation.
    ['1. d4 d5 2. c4 e6 3. Nc3 Nf6 *', 'D35', "Queen's Gambit Declined", 6],
  ]) it(`detects ${eco} ${name}`, () => expect(detectOpening(game(pgn), index)).toMatchObject({ eco, name, matchedPly: ply, source: 'local' }));
  it('detects a transposition using board/turn/castling/legal-en-passant state', () => {
    const canonical = detectOpening(game('1. d4 d5 2. c4 e6 3. Nc3 Nf6 *'), index);
    const transposed = detectOpening(game('1. d4 Nf6 2. c4 e6 3. Nc3 d5 *'), index);
    expect(transposed.eco).toBe(canonical.eco); expect(transposed.name).toBe(canonical.name); expect(transposed.variation).toBe(canonical.variation); expect(transposed.transposed).toBe(true);
  });
  it('uses the deepest recorded match and retains a mapped family after an unknown continuation', () => {
    const line = game('1. e4 e5 2. Nf3 Nc6 3. Bb5 a5 4. h3 h6 *');
    // The pinned dataset names 3...a5 the Bulgarian Variation; h3/h6 is unmapped.
    expect(detectOpening(line, index)).toMatchObject({ eco: 'C60', name: 'Ruy Lopez', variation: 'Bulgarian Variation', matchedPly: 6 });
  });
  it('returns explicit unavailable for an unmapped line or missing local data', () => {
    expect(detectOpening(game('1. e4 *'), { positions: {} }).name).toBe('Opening unavailable');
    expect(detectOpening(game('1. e4 *'), null).name).toBe('Opening unavailable');
  });
  it('does not classify arbitrary FEN positions or FEN-start games from placement alone', () => {
    const chess = new Chess(); chess.loadPgn('1. e4 c5'); const fen = chess.fen();
    expect(detectOpening(gameFromFen(fen), index)).toMatchObject({ name: 'Opening unavailable', source: 'unavailable' });
    expect(detectOpening(game(`[SetUp "1"]\n[FEN "${fen}"]\n\n2. Nf3 *`), index).source).toBe('unavailable');
    expect(canDetectOpening(gameFromFen(new Chess().fen()))).toBe(false);
  });
  it('can show explicitly supplied opening headers for FEN games without calling them detected', () => {
    const input = game('[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/K7 b - - 0 34"]\n[Opening "Supplied historical context"]\n[ECO "A00"]\n\n34... Kh7 *');
    expect(detectOpening(input, index)).toMatchObject({ name: 'Supplied historical context', source: 'pgn', eco: 'A00' });
  });
  it('normalizes irrelevant clocks but retains side, castling and legal EP rights', () => {
    const start = new Chess().fen(); expect(positionKey(start)).toBe(positionKey(start.replace('0 1', '27 44')));
    expect(positionKey(start)).not.toBe(positionKey(start.replace(' w ', ' b ')));
    expect(positionKey(start)).not.toBe(positionKey(start.replace(' KQkq ', ' - ')));
    const chess = new Chess(); chess.loadPgn('1. e4 a6 2. e5 d5');
    expect(positionKey(chess.fen())).toMatch(/ d6$/); expect(positionKey(chess.fen())).not.toBe(positionKey(chess.fen().replace(' d6 ', ' - ')));
  });
  it('resolves tied positions by exact UCI line, canonical depth and deterministic ECO/name order', () => {
    const input = game('1. e4 *'), key = positionKey(input.positions[1]);
    const custom = { revision: 'fixture', positions: { [key]: [['B00', 'Other', 'g1f3', 1], ['A00', 'Exact', 'e2e4', 1]] } };
    expect(detectOpening(input, custom).name).toBe('Exact'); custom.positions[key].reverse(); expect(detectOpening(input, custom).name).toBe('Exact');
  });
  it('never mutates the original PGN, positions or recorded moves', () => {
    const input = game('1. e4 c5 *'), snapshot = JSON.stringify(input); detectOpening(input, index); expect(JSON.stringify(input)).toBe(snapshot);
  });
});
