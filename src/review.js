import { Chess } from 'chess.js';
import { FEEDBACK, PIECE_NAMES, VALUES, moveLabel, scoreText, uciMove } from './chess';
import { moveMeaning } from './moveMeaning.js';
import { accuracyFromLoss, accuracySummary, aggregateAccuracy } from './accuracy.js';
export { accuracySummary } from './accuracy.js';

// Classification never overwrites numeric accuracy, including Brilliant/Best.
export function moveAccuracy(record) {
  return accuracyFromLoss(record?.loss);
}

// Phase 4 report selector. Count each recorded ply exactly once using the actual
// mover color, never index parity; a Black-start FEN game can have unequal totals.
// Foreign/stale/out-of-range records are not turned into reviewed moves.
export function reviewCategoryCounts(game, records, generationId = null) {
  const categories = Object.fromEntries(Object.keys(FEEDBACK).map(type => [type, { w: 0, b: 0 }]));
  const sides = { w: { total: 0, reviewed: 0, unreviewed: 0 }, b: { total: 0, reviewed: 0, unreviewed: 0 } };
  game.moves.forEach((move, index) => {
    const side = sides[move.color];
    side.total++;
    const record = records[index + 1];
    if (record && Object.hasOwn(categories, record.type) && (!generationId || record.provenance?.generationId === generationId)) {
      categories[record.type][move.color]++; side.reviewed++;
    } else side.unreviewed++;
  });
  return { categories, ...sides, total: game.moves.length, reviewed: sides.w.reviewed + sides.b.reviewed, unreviewed: sides.w.unreviewed + sides.b.unreviewed };
}

// Completed evaluation evidence only: rules-derived outcomes have no search
// depth. Cached same-generation evaluations are counted once, not per resume.
export function reviewDepthSummary(review) {
  const summarize = evaluations => {
    const values = Object.values(evaluations || {});
    const searches = values.filter(value => value.source === 'engine');
    const rules = values.filter(value => value.source === 'rules');
    return { searches: searches.length, rules: rules.length, min: searches.length ? Math.min(...searches.map(value => value.depth)) : null, max: searches.length ? Math.max(...searches.map(value => value.depth)) : null, belowTarget: searches.filter(value => value.depth < value.targetDepth).length };
  };
  const rechecks = Object.values(review.rechecks || {});
  return { positions: summarize(review.positions), acceptances: summarize(review.acceptances), verification: summarize(Object.fromEntries(rechecks.flatMap((check, index) => [['best', check.best], ['played', check.played], ['candidates', check.candidates]].filter(([, value]) => value).map(([kind, value]) => [`${index}-${kind}`, value])))), unresolved: rechecks.filter(check => check.provisional).length };
}

// Legal static-exchange analysis on the offered square. Allow either player to
// decline the exchange and limit the tree to avoid blocking board interaction.
function exchangeGain(chess, square, depth = 6, budget = { left: 48, truncated: false }) {
  const legal = chess.moves({ verbose: true }).filter(move => move.to === square && move.captured)
    .sort((a, b) => VALUES[a.piece] - VALUES[b.piece]);
  if (!depth || budget.left-- <= 0) { if (legal.length) budget.truncated = true; return 0; }
  if (legal.length > 3) budget.truncated = true;
  const captures = legal.slice(0, 3);
  let best = 0;
  for (const move of captures) {
    chess.move(uciMove(move.from + move.to + (move.promotion || '')));
    const gain = VALUES[move.captured] + (move.promotion ? VALUES[move.promotion] - 1 : 0) - exchangeGain(chess, square, depth - 1, budget);
    chess.undo(); best = Math.max(best, gain);
  }
  return best;
}

export function sacrificeCandidate(move, record) {
  if (!record || record.provisional || record.type === 'forced' || record.loss > 1.5 || (record.comparisonBefore || record.before).pv?.[0] !== move.uci || ['p', 'k'].includes(move.piece) || move.promotion) return null;
  const sign = move.color === 'w' ? 1 : -1;
  if (record.after.cp * sign < -50 || record.before.cp * sign > 500 || Math.min(record.before.depth, record.after.depth) < 12) return null;
  const chess = new Chess(move.after), capturedValue = VALUES[move.captured] || 0;
  let best = null;
  for (const capture of chess.moves({ verbose: true }).filter(reply => reply.to === move.to && reply.captured)) {
    chess.move(uciMove(capture.from + capture.to + (capture.promotion || '')));
    const budget = { left: 48, truncated: false };
    const cost = VALUES[capture.captured] - exchangeGain(chess, move.to, 6, budget) - capturedValue;
    chess.undo();
    // A sacrifice is >= 1.5 points at risk, OR a piece (minor/major) given up for pawns with
    // >= 1 point net loss (e.g. Bxa3 bxa3 Qxa3+: bishop for two pawns). The second rule was
    // added after Chess.com game 185626013138 marked 9...Bxa3 Brilliant while Linea's
    // 1.5-point threshold rejected its 1-point net cost. Engine compensation is still verified.
    const pieceForPawns = VALUES[move.piece] >= 3 && cost >= 1 && VALUES[capture.captured] >= 3;
    if (!budget.truncated && (cost >= 1.5 || pieceForPawns) && (!best || cost > best.cost)) best = { cost, acceptance: capture.from + capture.to + (capture.promotion || ''), san: capture.san, fen: capture.after, offeredPiece: move.piece, square: move.to, exchangeCompleteWithinBounds: true, rule: cost >= 1.5 ? 'material-at-risk' : 'piece-for-pawns' };
  }
  return best;
}

export function withBrilliance(record, candidate, acceptedEvaluation, move) {
  const sign = move.color === 'w' ? 1 : -1;
  // Validate an actual legal capture with a separate native engine search. An
  // equal trade, a merely hanging piece, or a shallow search is not Brilliant.
  const verified = !record.provisional && !!candidate && !!acceptedEvaluation && acceptedEvaluation.kind !== 'claimable-draw' && (acceptedEvaluation.exact || acceptedEvaluation.depth >= 12) && acceptedEvaluation.cp * sign >= -50 && acceptedEvaluation.cp * sign >= record.after.cp * sign - 75;
  const brilliance = candidate ? {
    verified, cost: candidate.cost, acceptance: candidate.acceptance, san: candidate.san,
    offeredPiece: candidate.offeredPiece, square: candidate.square,
    evaluation: acceptedEvaluation, depth: acceptedEvaluation?.depth || 0,
    explanation: verified ? `Offers a ${PIECE_NAMES[candidate.offeredPiece]} on ${candidate.square}. Bounded legal exchange analysis estimates ${candidate.cost.toFixed(0)} points at risk; after ${candidate.san}, ${acceptedEvaluation.exact ? 'the exact terminal result preserves the outcome' : `Stockfish still finds compensation at depth ${acceptedEvaluation.depth}`}.` : 'A possible sacrifice was checked, but did not meet Linea’s depth and compensation thresholds.',
  } : null;
  return { ...record, type: verified ? 'brilliant' : record.type, brilliance, accuracy: moveAccuracy(record) };
}

export function moveExplanation(move, record, context = {}) {
  const meaning = moveMeaning(move, record, context);
  if (!meaning) return null;
  return { ...meaning, title: `${move.color === 'w' ? 'White' : 'Black'} · ${moveLabel(move)}`, body: meaning.reason, before: scoreText(record.comparisonBefore || record.before), after: scoreText(record.comparisonAfter || record.after), accuracy: moveAccuracy(record) };
}

// Phase split shared by coaching and the overview's phase rows. Low material is an
// endgame even in the first moves (e.g. a FEN-started king-and-pawn ending is never
// rated as an "opening"); otherwise the first 12 moves are the opening.
function phase(move) {
  const chess = new Chess(move.before);
  const material = chess.board().flat().filter(Boolean).reduce((sum, piece) => sum + VALUES[piece.type], 0);
  if (material <= 26) return 'endgame';
  return move.number <= 12 ? 'opening' : 'middlegame';
}
// Game-phase performance (overview panel). Reuses the canonical phase() split above and
// the same volatility-weighted aggregation as player accuracy, restricted to the phase's
// scored moves of one color. Fewer than PHASE_MIN_MOVES scored moves is reported as
// unavailable instead of rating a phase from one or two moves.
export const GAME_PHASES = ['opening', 'middlegame', 'endgame'];
export const PHASE_MIN_MOVES = 3;
// Presentation band only: maps a phase accuracy to the nearest classification icon.
export function phaseRating(accuracy) {
  if (!Number.isFinite(accuracy)) return null;
  return accuracy >= 90 ? 'best' : accuracy >= 80 ? 'excellent' : accuracy >= 68 ? 'good' : accuracy >= 55 ? 'inaccuracy' : accuracy >= 40 ? 'mistake' : 'blunder';
}
export function phasePerformance(game, records, generationId = null) {
  const summary = accuracySummary(game, records, generationId), phases = game.moves.map(phase);
  return Object.fromEntries(GAME_PHASES.map(stage => [stage, Object.fromEntries(['w', 'b'].map(color => {
    const played = game.moves.some((move, index) => move.color === color && phases[index] === stage);
    const entries = summary[color].entries.filter(entry => phases[entry.ply - 1] === stage);
    if (!played) return [color, { accuracy: null, type: null, moves: 0, reason: 'Phase not reached' }];
    if (entries.length < PHASE_MIN_MOVES) return [color, { accuracy: null, type: null, moves: entries.length, reason: entries.length ? `Only ${entries.length} reviewed ${entries.length === 1 ? 'move' : 'moves'}; too few to rate` : 'Not yet reviewed' }];
    const accuracy = aggregateAccuracy(entries);
    return [color, { accuracy, type: phaseRating(accuracy), moves: entries.length, reason: accuracy === null ? 'No scoring evidence' : null }];
  }))]));
}

function theme(move, record) {
  try {
    const chess = new Chess(move.after);
    const reply = record.after.pv?.[0] ? chess.move(uciMove(record.after.pv[0])) : null;
    if (reply?.captured) return 'piece safety';
    if (reply?.san.includes('+') || reply?.san.includes('#')) return 'forcing replies';
  } catch { /* A missing PV simply falls through to an observed move trait. */ }
  if (move.piece === 'p') return 'pawn decisions';
  return phase(move) === 'opening' ? 'opening decisions' : 'candidate-move comparison';
}
const DRILLS = {
  'piece safety': 'Before committing, scan every opponent capture. For each loose piece, count attackers and defenders, then calculate the exchange rather than relying on the count alone.',
  'forcing replies': 'After choosing a move, list the opponent’s checks and captures first. Calculate the strongest forcing reply before looking at quieter plans.',
  'pawn decisions': 'Compare the engine’s first choice with your pawn push. Check which squares, captures and pawn breaks become available to each side after both moves.',
  'opening decisions': 'Replay the flagged opening positions without the engine arrow. Name two candidate moves, compare development and king safety, then reveal the engine line.',
  'candidate-move comparison': 'At the flagged position, choose two legal candidates. Write down the strongest reply to each, then compare your calculation with the engine continuation.',
};

export function coachingSummary(game, records, color) {
  const entries = game.moves.flatMap((move, index) => move.color === color && records[index + 1] ? [{ move, ply: index + 1, record: records[index + 1] }] : []);
  if (!entries.length) return null;
  const sound = entries.filter(entry => entry.record.loss <= 3).length;
  const critical = [...entries].filter(entry => entry.record.loss > 3).sort((a, b) => b.record.loss - a.record.loss).slice(0, 3);
  const themes = {}, phases = {};
  for (const entry of entries.filter(entry => entry.record.loss > 3)) {
    const key = theme(entry.move, entry.record), stage = phase(entry.move);
    themes[key] = { count: (themes[key]?.count || 0) + 1, loss: (themes[key]?.loss || 0) + entry.record.loss };
    phases[stage] = (phases[stage] || 0) + entry.record.loss;
  }
  // Prioritize the most costly recurring theme; a tied count must not hide a
  // mating blunder behind an earlier, small pawn inaccuracy.
  const focusEntry = Object.entries(themes).sort((a, b) => b[1].loss - a[1].loss || b[1].count - a[1].count)[0];
  const focus = focusEntry ? [focusEntry[0], focusEntry[1].count] : null;
  const hardest = Object.entries(phases).sort((a, b) => b[1] - a[1])[0]?.[0];
  const brilliant = entries.filter(entry => entry.record.type === 'brilliant');
  const name = game.headers[color === 'w' ? 'White' : 'Black'] || (color === 'w' ? 'White' : 'Black');
  return {
    name, reviewed: entries.length, total: game.moves.filter(move => move.color === color).length,
    headline: focus ? `${name}, start with ${focus[0]}.` : `${name}, build on your sound decisions.`,
    strength: `${sound} of your ${entries.length} reviewed moves were rated good or better${brilliant.length ? `, including ${brilliant.length} engine-supported ${brilliant.length === 1 ? 'sacrifice' : 'sacrifices'}` : ''}.`,
    focus: focus ? `${focus[1]} reviewed ${focus[1] === 1 ? 'position points' : 'positions point'} to ${focus[0]}. Your largest accumulated chance losses came in the ${hardest}.` : 'No reviewed move has lost more than 3 estimated percentage points so far. Recheck the closest decisions at greater depth before drawing a final conclusion.',
    drill: DRILLS[focus?.[0]] || DRILLS['candidate-move comparison'], critical, brilliant,
  };
}
