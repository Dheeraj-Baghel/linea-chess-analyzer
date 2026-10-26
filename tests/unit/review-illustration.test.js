import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { parseGame, positionChess, toUci, uciMove } from '../../src/chess.js';
import { moveExplanation } from '../../src/review.js';
import { createReviewIllustration, exploreIllustratedMove, illustrationBoard, illustrationIsCurrent, sourceBoard } from '../../src/reviewIllustration.js';
import { safeWorkspaceDraft } from '../../src/workspaceDraft.js';

function harness({ branch = false } = {}) {
  const game = parseGame('1. e4 e5 2. Nf3 Nc6 *'), ply = branch ? 2 : 3;
  let variation = null, variationPly = 0;
  if (branch) {
    const b = positionChess(game, 2, null, 0), raw = b.move('d4');
    variation = { basePly: 2, moves: [{ ...raw, uci: toUci(raw), number: 2 }] }; variationPly = 1;
  }
  const move = branch ? variation.moves[0] : game.moves[2];
  const b = new Chess(move.after), pv = [];
  for (const san of branch ? ['exd4', 'Qxd4'] : ['Nc6', 'Bc4']) pv.push(toUci(b.move(san)));
  const record = { type: 'good', loss: 2, before: { cp: 20, depth: 16, pv: [move.uci], fen: move.before }, after: { cp: 0, depth: 16, pv, fen: move.after } };
  const review = { generation: { id: 'accepted-generation' }, records: { [ply]: record }, done: 3, total: 4 };
  const context = { game, ply, variation, variationPly };
  const explanation = moveExplanation(move, record, context);
  const illustration = createReviewIllustration({ ...context, record, explanation, generationId: review.generation.id, mobileTab: 'insights' });
  return { ...context, record, review, explanation, illustration };
}

describe('transient illustration state, not an analysis branch', () => {
  for (const branch of [false, true]) it(`replays from the correct ${branch ? 'branch' : 'game'} prefix and returns exactly to its source move`, () => {
    const h = harness({ branch }), before = JSON.stringify({ game: h.game, review: h.review, variation: h.variation });
    expect(h.illustration).toBeTruthy(); expect(h.illustration.step).toBe(1);
    expect(illustrationBoard(h.game, h.illustration, 0).fen()).toBe(h.explanation.move.before);
    expect(illustrationBoard(h.game, h.illustration, 1).fen()).toBe(h.explanation.move.after);
    const board = illustrationBoard(h.game, h.illustration, h.illustration.line.length);
    expect(board.fen()).toBe(h.explanation.line.at(-1).after);
    expect(sourceBoard(h.game, h.illustration).fen()).toBe(h.explanation.move.after);
    expect(JSON.stringify({ game: h.game, review: h.review, variation: h.variation })).toBe(before);
  });
  it('does not persist an illustration or silently restore it as a new variation', () => {
    const h = harness(), draft = { ply: h.ply, variation: h.variation, variationPly: h.variationPly };
    const restored = safeWorkspaceDraft(h.game, draft);
    expect(restored.variation).toBeNull(); expect(restored.ply).toBe(h.ply); expect(restored).not.toHaveProperty('illustration');
  });
  it('refuses stale explanation roots and played moves', () => {
    const h = harness();
    expect(createReviewIllustration({ ...h, explanation: { ...h.explanation, line: [{ ...h.explanation.move, before: h.game.initialFen }] } })).toBeNull();
    expect(createReviewIllustration({ ...h, ply: 1 })).toBeNull();
  });
  it('invalidates playback on new game, generation, review record or source navigation', () => {
    const h = harness(); expect(illustrationIsCurrent(h.illustration, h)).toBe(true);
    for (const context of [{ ...h, game: { ...h.game, id: 'other' } }, { ...h, ply: 2 }, { ...h, review: { ...h.review, generation: { id: 'rerun' } } }, { ...h, review: { ...h.review, records: {} } }]) expect(illustrationIsCurrent(h.illustration, context)).toBe(false);
  });
  it('turns a new user move into normal exploration with no old explanation attached', () => {
    const h = harness();
    const branch = exploreIllustratedMove(h.game, h.illustration, 1, ['d7d6']);
    expect(branch.basePly).toBe(3); expect(branch.moves.map(move => move.uci)).toEqual(['d7d6']); expect(branch).not.toHaveProperty('explanation');
    expect(positionChess(h.game, branch.basePly, branch, branch.moves.length).fen()).toBe(new Chess(h.explanation.move.after).move(uciMove('d7d6')).after);
  });
  it('a user move following the illustration itself still explicitly becomes exploration', () => {
    const h = harness();
    const branch = exploreIllustratedMove(h.game, h.illustration, 1, ['b8c6']);
    expect(branch.basePly).toBe(3); expect(branch.moves[0].uci).toBe('b8c6'); expect(branch).not.toHaveProperty('explanation');
  });
});
