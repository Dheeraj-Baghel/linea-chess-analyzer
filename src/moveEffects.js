import { Chess } from 'chess.js';
import { PIECE_NAMES } from './chess.js';

// Position-specific observable changes, NOT an evaluation or strategic verdict.
// Shared by the played and preferred move from the identical before-position.
const CENTER = ['d4', 'e4', 'd5', 'e5'];
const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const STRAIGHTS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const xy = square => [square.charCodeAt(0) - 97, Number(square[1]) - 1];
const squareAt = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8 ? String.fromCharCode(97 + x) + (y + 1) : null;
const list = values => values.length < 2 ? values[0] || '' : `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
const home = color => color === 'w' ? { n: ['b1', 'g1'], b: ['c1', 'f1'] } : { n: ['b8', 'g8'], b: ['c8', 'f8'] };
function legalDestinations(board, square) {
  const piece = board.get(square); if (!piece) return [];
  const fields = board.fen().split(' ');
  if (fields[1] !== piece.color) { fields[1] = piece.color; fields[3] = '-'; }
  const local = new Chess(fields.join(' '));
  return local.moves({ square, verbose: true }).map(move => move.to);
}
function ray(board, square, direction) {
  const [x, y] = xy(square), [dx, dy] = direction, squares = [];
  for (let step = 1; step < 8; step++) {
    const next = squareAt(x + dx * step, y + dy * step); if (!next) break;
    if (board.get(next)) break;
    squares.push(next);
  }
  return squares;
}
function routeChanges(move, before, after) {
  const result = { opened: [], blocked: [] };
  if (move.piece !== 'p') return result;
  for (const piece of after.board().flat().filter(item => item?.color === move.color && ['b', 'q', 'r'].includes(item.type))) {
    if (before.get(piece.square)?.type !== piece.type) continue;
    const directions = piece.type === 'b' ? DIAGONALS : piece.type === 'r' ? STRAIGHTS : [...DIAGONALS, ...STRAIGHTS];
    const legal = new Set(legalDestinations(after, piece.square));
    for (const direction of directions) {
      const old = ray(before, piece.square, direction), next = ray(after, piece.square, direction);
      const added = next.filter(square => !old.includes(square) && legal.has(square));
      const removed = old.filter(square => !next.includes(square));
      if (added.length) result.opened.push({ piece: piece.type, from: piece.square, to: added.at(-1), squares: next, newlyAvailable: added, diagonal: Boolean(direction[0] && direction[1]) });
      if (removed.length && old.includes(move.to)) result.blocked.push({ piece: piece.type, from: piece.square, to: old.at(-1), squares: old, blockedAt: move.to, diagonal: Boolean(direction[0] && direction[1]) });
    }
  }
  return result;
}

export function moveEffects(move, before, after) {
  const isDevelopment = home(move.color)[move.piece]?.includes(move.from) && move.to[1] !== (move.color === 'w' ? '1' : '8');
  const active = ['n', 'b', 'r', 'q'].includes(move.piece), nextMoves = active ? legalDestinations(after, move.to) : [], oldMoves = active ? legalDestinations(before, move.from) : [];
  const centralControl = CENTER.filter(square => nextMoves.includes(square));
  const priorControl = CENTER.filter(square => oldMoves.includes(square));
  const routes = routeChanges(move, before, after);
  let rookActivation = null;
  if (/[kq]/.test(move.flags)) {
    const rank = move.color === 'w' ? '1' : '8', rookTo = `${move.flags.includes('k') ? 'f' : 'd'}${rank}`;
    const rookFrom = `${move.flags.includes('k') ? 'h' : 'a'}${rank}`;
    const beforeMoves = legalDestinations(before, rookFrom), afterMoves = legalDestinations(after, rookTo);
    const gained = afterMoves.filter(square => !beforeMoves.includes(square));
    if (gained.length) rookActivation = { from: rookFrom, to: rookTo, gained };
  }
  return { development: Boolean(isDevelopment), centralAdvance: move.piece === 'p' && ['d', 'e'].includes(move.to[0]) && CENTER.includes(move.to), centralControl, newlyControlled: centralControl.filter(square => !priorControl.includes(square)), ...routes, rookActivation };
}

export function positionalIdea(move, effects, recapture = false) {
  const piece = PIECE_NAMES[move.piece];
  const diagonalTypes = [...new Set(effects.opened.filter(route => route.diagonal).map(route => PIECE_NAMES[route.piece]))].sort();
  if (effects.development && move.captured) return {
    kind: 'capture-development',
    text: `You ${recapture ? 'recover' : 'capture'} the ${PIECE_NAMES[move.captured]} while developing your ${piece}.${effects.centralControl.length ? ` From ${move.to}, it controls ${list(effects.centralControl)}.` : ''}`,
    supports: [recapture ? 'recapture' : 'capture', 'development', ...(effects.centralControl.length ? ['central-control'] : [])],
  };
  if (effects.centralAdvance && diagonalTypes.length) return { kind: 'centre-and-diagonals', text: `You claim space in the centre and open ${diagonalTypes.length > 1 ? 'diagonals' : 'a diagonal'} for your ${list(diagonalTypes)}.`, supports: ['central-pawn', 'opened-routes'] };
  if (effects.development && effects.newlyControlled.length) return { kind: 'development-and-control', text: `You develop your ${piece} toward the centre. From ${move.to}, it now controls ${list(effects.newlyControlled)}.`, supports: ['development', 'central-control'] };
  if (effects.rookActivation) return { kind: 'castling-rook-activation', text: `You castle and bring your rook from ${effects.rookActivation.from} to ${effects.rookActivation.to}. The rook gains access to ${list(effects.rookActivation.gained.slice(0, 2))}.`, supports: ['castling', 'rook-activation'] };
  const opened = effects.opened[0];
  if (opened) return { kind: 'opened-route', text: `Your pawn move opens a ${opened.diagonal ? 'diagonal' : 'route'} for the ${PIECE_NAMES[opened.piece]} on ${opened.from}. It can now move along that route toward ${opened.to}.`, supports: ['opened-routes'] };
  const blocked = effects.blocked[0];
  if (blocked) return { kind: 'blocked-route', text: `Your pawn on ${blocked.blockedAt} blocks the ${PIECE_NAMES[blocked.piece]}'s ${blocked.diagonal ? 'diagonal' : 'route'} from ${blocked.from} toward ${blocked.to}.`, supports: ['blocked-routes'] };
  return null;
}

// A comparative fact identifies a real difference, not why Stockfish valued it
// by itself. Kept out of the default judgment unless supported by a concrete
// tactical response (see moveMeaning), otherwise available in Explain/Compare.
export function observableComparison(played, preferred, playedEffects, preferredEffects) {
  if (preferredEffects.development && !playedEffects.development) return { kind: 'development-difference', text: `Unlike ${played.san}, ${preferred.san} brings the ${PIECE_NAMES[preferred.piece]} from ${preferred.from} to ${preferred.to}${preferredEffects.centralControl.length ? `, controlling ${list(preferredEffects.centralControl)}` : ''}. This observed difference alone does not explain the engine's judgment.`, evidence: { played: played.uci, preferred: preferred.uci, difference: 'development' } };
  const route = preferredEffects.opened.find(item => !playedEffects.opened.some(old => old.from === item.from && old.to === item.to));
  if (route) return { kind: 'route-difference', text: `${preferred.san} opens the ${PIECE_NAMES[route.piece]}'s route from ${route.from} toward ${route.to}, which ${played.san} does not open. This is an observable difference, not a proven reason for the judgment.`, evidence: { played: played.uci, preferred: preferred.uci, route } };
  return null;
}
