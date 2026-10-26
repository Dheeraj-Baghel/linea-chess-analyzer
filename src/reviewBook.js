import { canDetectOpening, positionKey } from './openings.js';

// Book means an actual position match against the pinned CC0 opening dataset,
// not first-N plies or a supplied name. Stop at the first unmapped position;
// later returns do not relabel the opening.
//
// linea-book-2 (22 Oct 2026, reliability audit): a position is documented if it
// occurs ANYWHERE on a documented line, not only at a line's named terminal
// position. Each dataset record is a complete legal move sequence, so its
// intermediate positions are documented theory too. The terminal-only rule
// missed e.g. 1.e4 d5 2.exd5 Qxd5 3.Nc3, which occurs only on the way to deeper
// named Scandinavian lines. Matching is by canonical EPD (side to move,
// castling, legal en passant), so transpositions are still recognized. The set
// is generated from the same pinned TSVs by scripts/build-openings-index.mjs
// (`npm run check:openings` verifies it) and lazy-loaded off the startup path.
export const BOOK_EVIDENCE_VERSION = 'linea-book-2';
let bookPromise;
export function loadBookPositions() {
  if (!bookPromise) bookPromise = import('./data/opening-book-positions.json').then(module => ({ revision: module.default.revision, keys: new Set(module.default.positions) })).catch(error => { bookPromise = null; throw error; });
  return bookPromise;
}
export async function bookMoveEvidence(game) {
  if (!canDetectOpening(game)) return { plies: new Set(), source: null };
  try {
    const book = await loadBookPositions(), plies = new Set();
    for (let ply = 1; ply < game.positions.length; ply++) {
      if (!book.keys.has(positionKey(game.positions[ply]))) break;
      plies.add(ply);
    }
    return { plies, source: { type: 'documented-line-position', version: BOOK_EVIDENCE_VERSION, revision: book.revision } };
  } catch { return { plies: new Set(), source: null }; }
}
