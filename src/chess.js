import { Chess, DEFAULT_POSITION } from 'chess.js';
import { chanceLoss } from './accuracy.js';

// The starter study is illustrative, not a historical game or a pre-scored review.
export const SAMPLE_PGN = `[Event "Ruy Lopez · an open-ended study"]
[Site "Linea sample study"]
[Date "2026.10.19"]
[Round "1"]
[White "Alex Morgan"]
[Black "Jamie Chen"]
[WhiteElo "1842"]
[BlackElo "1876"]
[Result "*"]
[TimeControl "600+5"]

1. e4 {[%clk 0:10:02]} e5 {[%clk 0:10:01]} 2. Nf3 {[%clk 0:10:03]} Nc6 {[%clk 0:09:58]} 3. Bb5 {[%clk 0:09:59]} a6 {[%clk 0:09:55]} 4. Ba4 {[%clk 0:09:58]} Nf6 {[%clk 0:09:51]} 5. O-O {[%clk 0:10:00]} Be7 {[%clk 0:09:46]} 6. Re1 {[%clk 0:09:54]} b5 {[%clk 0:09:41]} 7. Bb3 {[%clk 0:09:53]} d6 {[%clk 0:09:34]} 8. c3 {[%clk 0:09:42]} O-O {[%clk 0:09:32]} 9. h3 {[%clk 0:09:36]} Nb8 {[%clk 0:09:18]} 10. d4 {[%clk 0:09:27]} Nbd7 {[%clk 0:09:14]} 11. Nbd2 {[%clk 0:09:12]} Bb7 {[%clk 0:09:09]} 12. Bc2 {[%clk 0:09:05]} Re8 {[%clk 0:09:01]} 13. Nf1 {[%clk 0:08:49]} Bf8 {[%clk 0:08:53]} 14. Ng3 {[%clk 0:08:36]} g6 {[%clk 0:08:42]} 15. a4 {[%clk 0:08:24]} c5 {[%clk 0:08:29]} 16. d5 {[%clk 0:08:14]} c4 {[%clk 0:08:18]} 17. Bg5 {[%clk 0:07:58]} h6 {[%clk 0:08:04]} 18. Be3 {[%clk 0:07:46]} Nc5 {[%clk 0:07:51]} 19. Qd2 {[%clk 0:07:33]} Kh7 {[%clk 0:07:42]} 20. Nh2 {[%clk 0:07:18]} Qe7 {[%clk 0:07:26]} *`;

export const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const UNICODE = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' };
// Independent, evidence-backed Linea labels; never provider-proprietary labels.
export const FEEDBACK = {
  book: { label: 'Book', icon: '▤', image: '/icons/moves/book.png', color: 'var(--feedback-book)', description: 'Position-matched local opening evidence; numeric accuracy is independent.' },
  forced: { label: 'Forced', icon: '□', color: 'var(--feedback-forced)', description: 'Only one legal move was available.' },
  brilliant: { label: 'Brilliant', icon: '!!', image: '/icons/moves/brilliant.png', color: 'var(--feedback-brilliant)', description: 'Linea detected a strong, engine-supported material sacrifice. This is a conservative heuristic, not Chess.com’s label.' },
  great: { label: 'Great', icon: '!', image: '/icons/moves/great.png', color: 'var(--feedback-great)', description: 'A verified best move with a large same-search gap to the second candidate.' },
  best: { label: 'Best', icon: '★', image: '/icons/moves/best.png', color: 'var(--feedback-best)', description: 'The engine’s first choice at the review depth.' },
  excellent: { label: 'Excellent', icon: '✓', image: '/icons/moves/excellent.png', color: 'var(--feedback-excellent)', description: 'Very close to the engine’s preferred move.' },
  good: { label: 'Good', icon: '•', image: '/icons/moves/good.png', color: 'var(--feedback-good)', description: 'A small loss in estimated winning chances.' },
  inaccuracy: { label: 'Inaccuracy', icon: '?!', image: '/icons/moves/inaccuracy.png', color: 'var(--feedback-inaccuracy)', description: 'A noticeable loss in estimated winning chances.' },
  mistake: { label: 'Mistake', icon: '?', image: '/icons/moves/mistake.png', color: 'var(--feedback-mistake)', description: 'A significant loss in estimated winning chances.' },
  miss: { label: 'Miss', icon: '×', image: '/icons/moves/miss.png', color: 'var(--feedback-miss)', description: 'A missed forced mate or verified large opportunity after an opponent error.' },
  blunder: { label: 'Blunder', icon: '??', image: '/icons/moves/blunder.png', color: 'var(--feedback-blunder)', description: 'A large loss in estimated winning chances.' },
};

export function uciMove(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length > 4 ? { promotion: uci[4] } : {}) };
}
export function toUci(move) { return move.from + move.to + (move.promotion || ''); }

// Read only mainline comments. Imported RAVs, NAGs and original formatting stay in rawPgn.
function readComments(pgn, moves) {
  const source = pgn.replace(/^\s*\[.*\]\s*$/gm, '');
  const comments = {};
  let variation = 0, ply = 0, i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '{') {
      const end = source.indexOf('}', i + 1);
      if (end < 0) break;
      if (!variation) comments[ply] = ((comments[ply] || '') + ' ' + source.slice(i + 1, end)).trim();
      i = end + 1; continue;
    }
    if (c === ';') { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end + 1; continue; }
    if (c === '(') { variation++; i++; continue; }
    if (c === ')') { variation = Math.max(0, variation - 1); i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    let end = i;
    while (end < source.length && !/[\s{}();]/.test(source[end])) end++;
    const token = source.slice(i, end).replace(/^\d+\.(?:\.\.)?/, '').replace(/[!?]+$/g, '');
    if (!variation && moves[ply] && token === moves[ply].san) ply++;
    i = Math.max(i + 1, end);
  }
  return comments;
}

function validatePositionForEngine(chess) {
  // chess.js syntax validation alone accepts some impossible starting positions.
  // The player who just moved cannot have left their own king attacked.
  const previous = chess.turn() === 'w' ? 'b' : 'w';
  const king = chess.board().flat().find(piece => piece?.type === 'k' && piece.color === previous);
  if (king && chess.isAttacked(king.square, chess.turn())) throw new Error('Invalid starting position: the side not to move is in check.');
}
export function parseGame(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn.trim(), { strict: false });
  const history = chess.history({ verbose: true });
  const headers = chess.getHeaders();
  const initialFen = history[0]?.before || headers.FEN || DEFAULT_POSITION;
  validatePositionForEngine(new Chess(initialFen));
  const comments = readComments(pgn, history);
  const moves = history.map((move, i) => ({
    ...move,
    uci: toUci(move),
    number: Number(move.before.split(' ')[5]),
    clock: comments[i + 1]?.match(/\[%clk\s+([^\]]+)\]/)?.[1]?.trim() || null,
    comment: (comments[i + 1] || '').replace(/\[%[^\]]*\]/g, '').trim(),
  }));
  return {
    id: crypto.randomUUID(), headers, initialFen, moves,
    positions: [initialFen, ...moves.map(move => move.after)],
    rawPgn: pgn.trim(), isSample: false,
  };
}

export function createSample() { return { ...parseGame(SAMPLE_PGN), isSample: true }; }

export function gameFromFen(fen) {
  const chess = new Chess(fen.trim());
  validatePositionForEngine(chess);
  chess.header('Event', 'Custom position', 'White', 'White', 'Black', 'Black', 'Result', '*', 'SetUp', '1', 'FEN', chess.fen());
  return {
    id: crypto.randomUUID(), headers: chess.getHeaders(), initialFen: chess.fen(),
    moves: [], positions: [chess.fen()], rawPgn: chess.pgn(), isSample: false,
  };
}

export function positionChess(game, ply, variation, variationPly) {
  const chess = new Chess(game.initialFen);
  const mainPly = variation ? variation.basePly : ply;
  for (const move of game.moves.slice(0, mainPly)) chess.move(uciMove(move.uci));
  if (variation) for (const move of variation.moves.slice(0, variationPly)) chess.move(uciMove(move.uci));
  return chess;
}

export function pvToSan(fen, pv, max = 10) {
  const chess = new Chess(fen), result = [];
  for (const uci of pv.slice(0, max)) {
    try {
      const number = Number(chess.fen().split(' ')[5]);
      const color = chess.turn();
      const move = chess.move(uciMove(uci));
      result.push({ san: move.san, uci, color, number });
    } catch { break; }
  }
  return result;
}

export function scoreText(line) {
  if (!line) return '—';
  if (line.mate !== null && line.mate !== undefined) return `${line.cp < 0 ? '−' : '+'}M${Math.abs(line.mate)}`;
  const value = line.cp / 100;
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}`;
}

export function advantage(line) {
  if (!line) return 'Waiting for evaluation';
  if (line.mate !== null && line.mate !== undefined) return line.mate === 0 ? `${line.cp >= 0 ? 'White' : 'Black'} wins by checkmate` : `${line.cp >= 0 ? 'White' : 'Black'} has forced mate in ${Math.abs(line.mate)}`;
  if (Math.abs(line.cp) < 30) return 'Approximately equal';
  return `${line.cp > 0 ? 'White' : 'Black'} is better`;
}

export function classify(before, after, move, context = {}) {
  if (!before || !after) return null;
  const comparisonBefore = context.comparisonBefore || before, comparisonAfter = context.comparisonAfter || after;
  const loss = chanceLoss(comparisonBefore, comparisonAfter, move.color);
  if (loss === null) return null;
  const best = comparisonBefore.pv?.[0] === move.uci && loss <= 1;
  const sign = move.color === 'w' ? 1 : -1;
  const missedMate = comparisonBefore.mate * sign > 0 && !(comparisonAfter.mate * sign > 0) && loss > 3;
  let type = best ? 'best' : loss <= 1 ? 'excellent' : loss <= 3 ? 'good' : loss <= 7 ? 'inaccuracy' : loss <= 15 ? 'mistake' : 'blunder';
  if (context.legalMovesCount === 1) type = 'forced';
  else if (!context.provisional && context.isBookMove && loss <= 3) type = 'book';
  else if (!context.provisional && best && context.pvGap >= 12) type = 'great';
  else if (!context.provisional && (missedMate || context.opponentError && context.pvGap >= 12 && loss > 7)) type = 'miss';
  return { type, loss, before, after, alternative: comparisonBefore.pv?.[0] || null, ...context };
}

export function materialInfo(chess) {
  const counts = { w: 0, b: 0 };
  chess.board().flat().forEach(piece => { if (piece) counts[piece.color] += VALUES[piece.type]; });
  const balance = counts.w - counts.b;
  return { balance, label: balance === 0 ? 'Material is equal' : `${balance > 0 ? 'White' : 'Black'} +${Math.abs(balance)} · material advantage` };
}

export function timeControl(value) {
  if (!value || value === '?' || value === '-') return 'Time control not supplied';
  if (/^\d+(\+\d+)?$/.test(value)) {
    const [seconds, increment] = value.split('+').map(Number);
    return `${seconds % 60 === 0 ? seconds / 60 : (seconds / 60).toFixed(1)} min${increment ? ` + ${increment} sec` : ''}`;
  }
  return value;
}

export function moveLabel(move) { return move ? `${move.number}${move.color === 'w' ? '.' : '…'} ${move.san}` : 'Starting position'; }
export { DEFAULT_POSITION };
