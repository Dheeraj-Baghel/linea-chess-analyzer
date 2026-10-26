// Builds the diagnostic manifest for the five-game comparison set.
// Every move is legally replayed with chess.js through Linea's own parseGame,
// so the ledger matches exactly what the review session receives.
// Screenshot observations are manual transcriptions (see SCREENSHOT_NOTES) and
// are retained as evaluation fixtures only; nothing here is used at runtime.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { parseGame } from '../../src/chess.js';

const dir = new URL('../../tests/fixtures/review-comparison/', import.meta.url);
const pgnText = readFileSync(new URL('linea-review-comparison-games.pgn', dir), 'utf8');
export const splitPgns = text => text.split(/\n(?=\[Event )/).map(value => value.trim()).filter(Boolean);

// Values read from the source document screenshots (image ordinals = embedded
// images in document order). WHITE / BLACK order, independent of orientation.
// `null` = unavailable/unreadable, never zero. Linea values are historical
// screenshots with unknown build, cache generation and search policy.
const CATEGORIES = ['brilliant', 'great', 'book', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'];
const counts = (white, black) => Object.fromEntries(CATEGORIES.map((key, index) => [key, { w: white[index], b: black[index] }]));
const SCREENSHOTS = {
  '185626013138': { images: { chesscomSummary: 1, chesscomFinalMove: 2, lineaSummary: 3 },
    chesscom: { accuracy: { w: 84.5, b: 90.9 }, gameRating: { w: 1650, b: 1950 }, counts: counts([0, 0, 2, 14, 18, 10, 0, 4, 0, 0], [1, 1, 2, 14, 22, 9, 0, 0, 0, 0]) },
    linea: { accuracy: { w: 91.2, b: 98.7 }, estimate: { w: 1910, b: 2200 }, counts: counts([0, 0, 2, 17, 16, 8, 2, 3, 0, 0], [1, 0, 1, 20, 19, 8, 0, 0, 0, 0]) } },
  '185433524714': { images: { chesscomSummary: 4, chesscomMoveList: 5, lineaSummary: 6 },
    chesscom: { accuracy: { w: 78.1, b: 69.9 }, gameRating: { w: 1600, b: 1050 }, counts: counts([0, 1, 2, 17, 22, 11, 4, 1, 3, 0], [0, 0, 2, 21, 11, 6, 10, 5, 0, 1]) },
    linea: { accuracy: { w: 88.5, b: 85.0 }, estimate: { w: 1830, b: 1710 }, counts: counts([0, 0, 2, 18, 23, 10, 5, 2, 1, 0], [0, 0, 2, 19, 15, 6, 8, 3, 0, 3]) } },
  '185382284602': { images: { chesscomSummary: 7, chesscomMoveList: 8, lineaSummary: 9 },
    chesscom: { accuracy: { w: 73.2, b: 81.5 }, gameRating: { w: 1300, b: 1750 }, counts: counts([0, 1, 4, 10, 7, 3, 4, 3, 0, 3], [0, 1, 4, 10, 12, 2, 3, 3, 0, 1]) },
    linea: { accuracy: { w: 70.6, b: 85.6 }, estimate: { w: 1310, b: 1720 }, counts: counts([0, 0, 1, 15, 8, 4, 3, 1, 0, 3], [0, 0, 0, 16, 8, 5, 3, 0, 1, 3]) } },
  '185297812650': { images: { chesscomSummary: 10, chesscomMoveList: 11, lineaSummary: 12 },
    chesscom: { accuracy: { w: 82.7, b: 74.0 }, gameRating: { w: 1800, b: 750 }, counts: counts([0, 1, 3, 21, 9, 7, 5, 0, 3, 0], [0, 0, 2, 10, 18, 4, 4, 6, 1, 0]) },
    linea: { accuracy: { w: 82.4, b: 78.9 }, estimate: { w: 1620, b: 1510 }, counts: counts([0, 0, 2, 19, 11, 8, 5, 3, 1, 0], [0, 0, 1, 12, 13, 11, 2, 3, 1, 2]) } },
  '185273768642': { images: { chesscomSummary: 13, chesscomMoveList: 14, lineaSummary: 15 },
    chesscom: { accuracy: { w: 80.4, b: 75.1 }, gameRating: { w: 1700, b: 1450 }, counts: counts([0, 2, 4, 18, 6, 5, 6, 3, 0, 0], [0, 3, 4, 13, 7, 9, 3, 4, 1, 1]) },
    linea: { accuracy: { w: 86.5, b: 79.3 }, estimate: { w: null, b: null }, counts: counts([0, 0, 3, 21, 3, 4, 8, 3, 0, 2], [0, 0, 2, 17, 7, 3, 7, 6, 1, 2]) } },
};

// Readable per-ply Chess.com icons. Chess.com's move list shows icons only for
// notable labels; an unmarked move is UNKNOWN (it could be Best/Excellent/Good
// without a visible icon), so only explicit icons are recorded. Keys are
// "moveNumber + w|b" and are converted to plies with SAN cross-checks below.
const REFERENCE_LABELS = {
  '185433524714': { image: 5, visibleMoves: '1-24 (25 partially cut)', labels: {
    '2b': ['e6', 'book'], '4b': ['dxc4', 'best'], '6b': ['Nge7', 'mistake'], '7w': ['Bxc4', 'best'], '13b': ['Bxd5', 'mistake'],
    '14w': ['bxa5', 'mistake'], '16b': ['O-O', 'blunder'], '17w': ['e5', 'great'], '17b': ['Bf5', 'mistake'], '18w': ['Qxf5', 'best'],
    '19w': ['exd6', 'best'], '24b': ['Qxa5', 'mistake'] } },
  '185382284602': { image: 8, visibleMoves: '8-36', labels: {
    '13b': ['Bxg3', 'blunder'], '16w': ['Nh2', 'great'], '21b': ['g5', 'mistake'], '22w': ['Qxe6', 'best'], '23b': ['Kc7', 'mistake'],
    '24w': ['e5', 'blunder'], '25w': ['Rxd7+', 'blunder'], '26b': ['Kc8', 'mistake'], '27w': ['Rh3', 'blunder'], '27b': ['Qd1+', 'great'],
    '28w': ['Nf1', 'mistake'], '29b': ['Rxe5', 'best'], '31w': ['Rxh6', 'mistake'], '33w': ['Kg1', 'mistake'], '36b': ['Qe4+', 'best'] } },
  '185297812650': { image: 11, visibleMoves: '23-49 (enlarged crop of 23-49 only)', labels: {
    '23b': ['h6', 'mistake'], '24w': ['Ne7+', 'best'], '24b': ['Kh7', 'mistake'], '44w': ['Rbb5', 'miss'], '45w': ['Qd6+', 'miss'],
    '46w': ['Qxe5+', 'miss'], '49w': ['Rd8#', 'best'] } },
  '185273768642': { image: 14, visibleMoves: '1-38', labels: {
    '4b': ['Nf6', 'book'], '6b': ['Qxb2', 'best'], '7w': ['Na4', 'mistake'], '7b': ['Qb4+', 'great'], '13w': ['Be2', 'mistake'],
    '13b': ['Bb4+', 'great'], '14b': ['O-O', 'miss'], '16b': ['Bb2', 'great'], '27b': ['Bxe4', 'best'], '30b': ['Bxg2', 'best'],
    '33b': ['Nc5', 'blunder'], '34w': ['Bxc5', 'best'], '34b': ['Rd8+', 'mistake'], '37w': ['Bf3', 'mistake'], '37b': ['Rb5', 'mistake'],
    '38w': ['Bxc6', 'best'] } },
  // Image 2 shows ply 99 (50.Be3, White's final move) with a Best star.
  '185626013138': { image: 2, visibleMoves: 'final move only', labels: { '50w': ['Be3', 'best'] } },
};

const sha = value => createHash('sha256').update(value).digest('hex');
export function buildManifest() {
  return splitPgns(pgnText).map((pgn, index) => {
    const game = parseGame(pgn);
    const id = /\/(\d{9,})/.exec(game.headers.Link)?.[1];
    const final = new Chess(game.positions.at(-1));
    const terminal = final.isCheckmate() ? 'checkmate' : final.isStalemate() ? 'stalemate' : final.isDraw() ? 'draw' : 'none';
    const ledger = game.moves.map((move, i) => ({ ply: i + 1, color: move.color, number: move.number, san: move.san, uci: move.uci, before: move.before, after: move.after }));
    const reference = REFERENCE_LABELS[id];
    const labels = reference ? Object.entries(reference.labels).map(([key, [san, label]]) => {
      const number = Number(key.slice(0, -1)), color = key.at(-1);
      const entry = ledger.find(move => move.number === number && move.color === color);
      if (!entry || entry.san.replace(/[+#]/g, '') !== san.replace(/[+#]/g, '')) throw new Error(`Reference label SAN mismatch ${id} ${key}: ${san} vs ${entry?.san}`);
      return { ply: entry.ply, color, san: entry.san, label };
    }).sort((a, b) => a.ply - b.ply) : [];
    return {
      ordinal: index + 1, id, white: game.headers.White, black: game.headers.Black,
      whiteElo: Number(game.headers.WhiteElo), blackElo: Number(game.headers.BlackElo),
      result: game.headers.Result, termination: game.headers.Termination, timeControl: game.headers.TimeControl, eco: game.headers.ECO,
      plies: game.moves.length, terminalOnBoard: terminal, finalFen: game.positions.at(-1),
      moveSequenceSha256: sha(game.moves.map(move => move.uci).join(' ')), pgnSha256: sha(pgn),
      screenshots: SCREENSHOTS[id], referenceLabels: { image: reference?.image ?? null, visibleMoves: reference?.visibleMoves ?? null, policy: 'Explicit icons only; unmarked visible moves are unknown, not inferred.', labels },
      ledger,
    };
  });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const manifest = buildManifest();
  writeFileSync(new URL('linea-review-comparison-manifest.json', dir), `${JSON.stringify({ schema: 'linea-review-comparison-manifest-1', generatedAt: new Date().toISOString(), source: 'https://docs.google.com/document/d/1006s91c9alLFqkJwTUxtbTk8yJuNDbzZi8xkCx_7oYE (exported read-only; not edited)', notes: 'Screenshot values are manual transcriptions of historical screenshots with unknown Linea build/cache/policy and unknown Chess.com engine/settings. Evaluation fixtures only; never runtime rules.', games: manifest }, null, 1)}\n`);
  for (const game of manifest) console.log(game.ordinal, game.id, game.plies, game.result, game.termination, 'board:', game.terminalOnBoard, 'labels:', game.referenceLabels.labels.length, game.finalFen);
}
