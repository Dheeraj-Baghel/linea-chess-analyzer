import { canDetectOpening, loadOpeningIndex, positionKey } from './openings.js';

// Book means an actual position match, not first-N plies or a supplied name.
// Stop at the first unmapped position; later returns do not relabel the opening.
export async function bookMoveEvidence(game) {
  if (!canDetectOpening(game)) return { plies: new Set(), source: null };
  try {
    const index = await loadOpeningIndex(), plies = new Set();
    for (let ply = 1; ply < game.positions.length; ply++) {
      if (!index.positions[positionKey(game.positions[ply])]) break;
      plies.add(ply);
    }
    return { plies, source: { type: 'position-match', revision: index.revision } };
  } catch { return { plies: new Set(), source: null }; }
}
