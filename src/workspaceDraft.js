import { Chess } from 'chess.js';
import { REVIEW_POLICIES } from './reviewPolicy.js';

// Recovery data is not authoritative chess history. Rebuild any temporary branch
// legally; a corrupt draft is ignored without changing the original PGN/review.
export function safeWorkspaceDraft(game, value = {}) {
  const bounded = (number, max) => Number.isInteger(number) ? Math.max(0, Math.min(max, number)) : 0;
  const ply = bounded(value.ply, game.moves.length);
  let variation = null;
  if (value.variation && Number.isInteger(value.variation.basePly) && value.variation.basePly >= 0 && value.variation.basePly <= game.moves.length && Array.isArray(value.variation.moves)) {
    try {
      const basePly = value.variation.basePly, board = new Chess(game.initialFen);
      for (const move of game.moves.slice(0, basePly)) board.move(move.uci);
      const moves = value.variation.moves.slice(0, 500).map(move => { const legal = board.move(move.uci); return { ...legal, uci: legal.from + legal.to + (legal.promotion || ''), number: Number(legal.before.split(' ')[5]) }; });
      variation = { basePly, moves };
    } catch { /* An invalid branch is dropped; original game remains intact. */ }
  }
  const annotations = {};
  for (const [fen, marks] of Object.entries(value.annotations || {}).slice(0, 500)) {
    if (!Array.isArray(marks)) continue;
    annotations[fen] = marks.slice(0, 200).filter(mark => ['square', 'arrow'].includes(mark.type) && /^[a-h][1-8]$/.test(mark.from) && /^[a-h][1-8]$/.test(mark.to) && /^var\(--annotation-(fern|blue|amber|rose)\)$/.test(mark.color));
  }
  return { ply, variation, variationPly: bounded(value.variationPly, variation?.moves.length || 0), annotations, flipped: Boolean(value.flipped), activePanel: ['report', 'guided'].includes(value.activePanel) ? value.activePanel : 'moves', contentTab: value.contentTab === 'moves' ? 'moves' : 'summary', coachColor: value.coachColor === 'b' ? 'b' : 'w', quality: Object.hasOwn(REVIEW_POLICIES, value.quality) ? value.quality : 'balanced', displayedQuality: Object.hasOwn(REVIEW_POLICIES, value.displayedQuality) ? value.displayedQuality : null };
}
