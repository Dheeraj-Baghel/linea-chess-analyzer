import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { parseGame } from '../../src/chess.js';
import { moveExplanation } from '../../src/review.js';
import { legalExplanationArrow, ideaHighlights, illustrationVisuals, nextMoveRecommendation } from '../../src/explanationVisuals.js';
import { createReviewIllustration, illustrationBoard, switchIllustrationLine } from '../../src/reviewIllustration.js';

function fixture() {
  const game = parseGame('1. e4 e5 *'), move = game.moves[0];
  const record = { type: 'good', loss: 2, before: { cp: 0, depth: 16, fen: move.before, pv: ['d2d4', 'd7d5'] }, after: { cp: 0, depth: 16, fen: move.after, pv: ['e7e5', 'g1f3'] } };
  const explanation = moveExplanation(move, record, { game, ply: 1 });
  const illustration = createReviewIllustration({ game, ply: 1, variation: null, variationPly: 0, record, explanation, generationId: null });
  return { game, move, record, explanation, illustration };
}
describe('purpose, alternative and reply are different visual states', () => {
  it('regular after-position marks only the pieces behind the selected idea, never a reply arrow', () => {
    const h = fixture(), board = new Chess(h.move.after);
    expect(ideaHighlights(h.explanation, board).map(mark => mark.square)).toEqual(expect.arrayContaining(['f1', 'd1']));
    expect(legalExplanationArrow(board, h.move, 'played', 'Played move')).toBeNull();
    const visuals = illustrationVisuals(h.illustration, board);
    expect(visuals.arrows).toEqual([]); expect(visuals.marks.length).toBeGreaterThan(0);
  });
  it('the played arrow exists only from the actual before-position', () => {
    const h = fixture(), start = { ...h.illustration, step: 0 };
    const visuals = illustrationVisuals(start, illustrationBoard(h.game, start));
    expect(visuals.arrows).toMatchObject([{ from: 'e2', to: 'e4', explanationKind: 'played' }]);
  });
  it('the preferred alternative gets a distinct legal arrow at the same before-root', () => {
    const h = fixture(), alt = switchIllustrationLine(h.illustration, 'alternative');
    const board = illustrationBoard(h.game, alt);
    expect(board.fen()).toBe(h.move.before); expect(alt.step).toBe(0);
    expect(illustrationVisuals(alt, board).arrows).toMatchObject([{ from: 'd2', to: 'd4', explanationKind: 'alternative' }]);
    expect(alt.sourceRecord).toBe(h.record);
  });
  it('the opponent reply appears only after explicitly following the played continuation', () => {
    const h = fixture(), follow = { ...h.illustration, view: 'continuation' };
    expect(illustrationVisuals(h.illustration, illustrationBoard(h.game, h.illustration)).arrows).toEqual([]);
    const reply = illustrationVisuals(follow, illustrationBoard(h.game, follow)).arrows[0];
    expect(reply).toMatchObject({ from: 'e7', to: 'e5', explanationKind: 'reply' }); expect(reply.label).toContain("Opponent's suggested reply");
  });
  it('a wrong-root or stale-board arrow is suppressed, even if the destination appears plausible', () => {
    const h = fixture(), alt = switchIllustrationLine(h.illustration, 'alternative');
    expect(illustrationVisuals(alt, new Chess(h.move.after)).arrows).toEqual([]);
    expect(ideaHighlights(h.explanation, new Chess(h.move.before))).toEqual([]);
  });
});

describe('best next move preview from accepted current-position evidence', () => {
  it('shows White at the starting root and Black after e4 without a live search', () => {
    const h = fixture(), board = new Chess(h.game.initialFen);
    expect(nextMoveRecommendation(board, { position: { cp: 20, fen: board.fen(), pv: ['e2e4'] } })).toMatchObject({ from: 'e2', to: 'e4', best: true });
    board.move('e4');
    expect(nextMoveRecommendation(board, { currentRecord: h.record })).toMatchObject({ from: 'e7', to: 'e5', san: 'e5', recommendation: true });
  });
  it('does not draw the previous before-PV or a stale generation on the current board', () => {
    const h = fixture(), board = new Chess(h.move.after);
    expect(nextMoveRecommendation(board, { position: h.record.before })).toBeNull();
    expect(nextMoveRecommendation(board, { generationId: 'new', position: { cp: 0, generationId: 'old', fen: board.fen(), pv: ['e7e5'] } })).toBeNull();
  });
  it('prefers the next recorded move root recheck, not the last played moves comparison', () => {
    const h = fixture(), board = new Chess(h.move.after);
    const nextRecord = { provenance: { generationId: 'same' }, comparisonBefore: { cp: 0, fen: board.fen(), pv: ['c7c5'] } };
    expect(nextMoveRecommendation(board, { generationId: 'same', nextRecord, currentRecord: h.record })).toMatchObject({ from: 'c7', to: 'c5' });
  });
});
