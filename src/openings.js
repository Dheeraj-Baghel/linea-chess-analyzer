import { Chess, DEFAULT_POSITION } from 'chess.js';

// Phase 3B: classify the RECORDED GAME, never a transient analysis branch.
// Supplied PGN metadata is labeled as supplied, not asserted to be independently
// verified. Local detection uses the pinned CC0 dataset and never an external API.
const unavailable = reason => ({ name: 'Opening unavailable', eco: null, variation: null, source: 'unavailable', sourceLabel: reason, matchedPly: null });
const text = value => typeof value === 'string' && value.trim().length <= 180 && !/[\u0000-\u001f]/.test(value) && !/^(?:[?*\-]+|unknown|n\/?a|none)$/i.test(value.trim()) ? value.trim() : null;

export function suppliedOpening(game) {
  const name = text(game.headers?.Opening), variation = text(game.headers?.Variation);
  const eco = /^[A-E]\d{2}$/i.test(game.headers?.ECO?.trim() || '') ? game.headers.ECO.trim().toUpperCase() : null;
  if (!name && !eco) return null;
  return { name: name || 'Opening name not supplied', eco, variation: name ? variation : null, source: 'pgn', sourceLabel: 'Supplied PGN metadata', matchedPly: null };
}
export function canDetectOpening(game) {
  return game.moves.length > 0 && game.initialFen === DEFAULT_POSITION && !game.headers?.FEN && game.headers?.SetUp !== '1';
}
export function positionKey(fen) {
  // Canonicalize castling order and only legal en-passant rights; move counters
  // do not affect an opening position. Side to move and castling DO matter.
  return new Chess(fen).fen().split(' ').slice(0, 4).join(' ');
}
export function detectOpening(game, index) {
  const supplied = suppliedOpening(game); if (supplied) return supplied;
  if (!canDetectOpening(game)) return unavailable('No standard-start recorded line');
  if (!index?.positions) return unavailable('Local opening data unavailable');
  const uci = game.moves.map(move => move.uci);
  // Deepest actual recorded ply wins, including transpositions. At a tied EPD,
  // prefer an exact UCI line, then deepest canonical line, then stable ECO/name/UCI.
  for (let ply = game.positions.length - 1; ply > 0; ply--) {
    const candidates = index.positions[positionKey(game.positions[ply])];
    if (!candidates?.length) continue;
    const sequence = uci.slice(0, ply).join(' ');
    const ranked = [...candidates].sort((a, b) => Number(b[2] === sequence) - Number(a[2] === sequence) || b[3] - a[3] || `${a[0]}\0${a[1]}\0${a[2]}`.localeCompare(`${b[0]}\0${b[1]}\0${b[2]}`, 'en'));
    const [eco, name, line] = ranked[0];
    return { name, eco, variation: null, source: 'local', sourceLabel: 'Detected locally · CC0 opening data', matchedPly: ply, transposed: line !== sequence, datasetRevision: index.revision };
  }
  return unavailable('No mapped recorded opening');
}

let dataPromise;
export function loadOpeningIndex() {
  // A separate local bundle keeps initial board/worker startup independent. Reuse
  // one resolved module across game replacements; a failed load can be retried.
  if (!dataPromise) dataPromise = import('./data/openings-index.json').then(module => module.default).catch(error => { dataPromise = null; throw error; });
  return dataPromise;
}
export { unavailable as unavailableOpening };
