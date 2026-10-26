import { Chess } from 'chess.js';
import { positionChess, toUci, uciMove } from './chess.js';
import { EXPLANATION_VERSION } from './moveMeaning.js';

// A transient viewer, NOT a variation and NOT a review owner. Original navigation,
// game/branch, checkpoints and annotations stay in App unchanged during playback.
// Drafts intentionally never contain this state: reload returns to the source move.
const originKey = (ply, variation, variationPly) => JSON.stringify([ply, variation?.basePly ?? null, variation?.moves.map(move => move.uci) || null, variationPly]);
const model = raw => ({ ...raw, uci: toUci(raw), number: Number(raw.before.split(' ')[5]) });
export function createReviewIllustration({ game, ply, variation, variationPly, record, explanation, generationId, mobileTab }) {
  if (!record || explanation?.version !== EXPLANATION_VERSION || !explanation.line?.length) return null;
  const move = variation ? variation.moves[variationPly - 1] : game.moves[ply - 1];
  if (!move || move.uci !== explanation.move.uci || move.before !== explanation.move.before || move.after !== explanation.move.after || record.provenance?.uci && record.provenance.uci !== move.uci) return null;
  try {
    const prefix = variation ? [...game.moves.slice(0, variation.basePly), ...variation.moves.slice(0, variationPly - 1)] : game.moves.slice(0, ply - 1);
    const board = new Chess(game.initialFen);
    for (const item of prefix) board.move(uciMove(item.uci));
    const line = explanation.line.map(item => {
      if (board.fen() !== item.before) throw new Error('Stale illustration root');
      const legal = model(board.move(uciMove(item.uci)));
      if (legal.after !== item.after) throw new Error('Stale illustration position');
      return legal;
    });
    return { gameId: game.id, initialFen: game.initialFen, generationId, sourceRecord: record,
      sourceKey: originKey(ply, variation, variationPly), origin: { ply, variation, variationPly, mobileTab },
      prefix: prefix.map(item => item.uci), line, playedLine: line, alternativeLine: explanation.alternative ? explanation.alternatives : [], lineMode: 'played', view: 'idea', explanation, step: 1 };
  } catch { return null; }
}
export function switchIllustrationLine(illustration, mode) {
  const line = mode === 'alternative' ? illustration.alternativeLine : illustration.playedLine;
  if (!line?.length) return illustration;
  return { ...illustration, line, lineMode: mode, view: mode === 'alternative' ? 'comparison' : 'idea', step: 0 };
}
export function illustrationIsCurrent(illustration, { game, ply, variation, variationPly, review }) {
  if (!illustration || illustration.explanation?.version !== EXPLANATION_VERSION || illustration.gameId !== game.id || illustration.initialFen !== game.initialFen || illustration.sourceKey !== originKey(ply, variation, variationPly) || illustration.generationId !== (review.generation?.id || null)) return false;
  return Boolean(variation || review.records[ply] === illustration.sourceRecord);
}
export function illustrationBoard(game, illustration, step = illustration.step) {
  const board = new Chess(game.initialFen);
  for (const uci of illustration.prefix) board.move(uciMove(uci));
  for (const move of illustration.line.slice(0, step)) board.move(uciMove(move.uci));
  return board;
}
export function exploreIllustratedMove(game, illustration, step, ucis) {
  const board = illustrationBoard(game, illustration, step);
  for (const uci of ucis) board.move(uciMove(uci));
  const history = board.history({ verbose: true }).map(model);
  let basePly = 0;
  // A new user move ALWAYS ends illustration mode, even if it happens to follow
  // the displayed engine line or a recorded move. It is now normal exploration.
  const max = history.length - ucis.length;
  while (basePly < max && history[basePly]?.uci === game.moves[basePly]?.uci) basePly++;
  return { basePly, moves: history.slice(basePly) };
}
export function sourceBoard(game, illustration) {
  const { ply, variation, variationPly } = illustration.origin;
  return positionChess(game, ply, variation, variationPly);
}
