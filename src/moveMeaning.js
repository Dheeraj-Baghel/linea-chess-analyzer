import { Chess } from 'chess.js';
import { PIECE_NAMES, VALUES, positionChess, toUci, uciMove } from './chess.js';
import { reviewTerminalEvaluation } from './reviewPolicy.js';
import { moveEffects, positionalIdea, observableComparison } from './moveEffects.js';

// Presentation evidence only: no engine requests, classification/accuracy changes,
// persistence, attacker/defender-count verdicts or speculative positional stories.
// v2: rank causal evidence, not arbitrary PV events. Observable board changes
// describe an idea; only a supported SAME-ROOT comparison can explain its loss.
// Default copy stays short; line notation, depth limits and uncertainty live in
// details (provisional evidence alone receives a prominent notice).
export const EXPLANATION_VERSION = 'linea-explanations-2';
export const EXPLANATION_LIMITS = Object.freeze({ pvPlies: 24, displayPlies: 12, exchangeNodes: 160, exchangePlies: 8, forkReplies: 24 });
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const side = color => color === 'w' ? 'White' : 'Black';
const other = color => color === 'w' ? 'b' : 'w';
const named = move => `${move.number}${move.color === 'w' ? '.' : '...'} ${move.san}`;
const described = raw => ({ ...raw, uci: toUci(raw), number: Number(raw.before.split(' ')[5]) });
const capturedSquare = move => move.flags.includes('e') ? move.to[0] + move.from[1] : move.to;
const canonical = fen => new Chess(fen).fen();
function copyBoard(source) {
  const history = source.history({ verbose: true }), board = new Chess(history[0]?.before || source.fen());
  for (const move of history) board.move(uciMove(toUci(move)));
  return board;
}

// Unlike pvToSan's UI-friendly legal-prefix behavior, a malformed evidence PV
// is rejected as a whole. A cap is explicitly marked, never a quiet endpoint.
export function replayEvidenceLine(fen, pv, limit = EXPLANATION_LIMITS.pvPlies) {
  if (!Array.isArray(pv) || !pv.length) return { moves: [], status: 'missing', capped: false };
  const board = typeof fen === 'string' ? new Chess(fen) : copyBoard(fen), moves = [];
  try {
    for (const uci of pv.slice(0, limit)) {
      if (typeof uci !== 'string' || !UCI.test(uci)) throw new Error('Invalid UCI');
      // No continuation beyond an exact board-terminal outcome.
      if (reviewTerminalEvaluation(board)) return { moves, status: 'legal', capped: false, terminal: true };
      moves.push(described(board.move(uciMove(uci))));
    }
    return { moves, status: 'legal', capped: pv.length > limit };
  } catch { return { moves: [], status: 'invalid', capped: false }; }
}

function boardFromPosition(position) {
  if (typeof position !== 'string' || !position.startsWith('position fen ')) return null;
  try {
    const [fen, suffix] = position.slice(13).split(' moves ');
    const board = new Chess(fen), moves = suffix ? suffix.trim().split(/\s+/) : [];
    if (moves.length > 1000) return null;
    for (const uci of moves) { if (!UCI.test(uci)) return null; board.move(uciMove(uci)); }
    return board;
  } catch { return null; }
}
function evaluationAt(evaluation, fen, generationId, historyBoard) {
  if (!evaluation || !Number.isFinite(evaluation.cp)) return false;
  if (evaluation.generationId && generationId && evaluation.generationId !== generationId) return false;
  try {
    if (evaluation.fen && canonical(evaluation.fen) !== fen) return false;
    if (evaluation.position) {
      const root = boardFromPosition(evaluation.position);
      if (root?.fen() !== fen) return false;
      if (historyBoard && (JSON.stringify(root.history()) !== JSON.stringify(historyBoard.history()) || (root.history({ verbose: true })[0]?.before || root.fen()) !== (historyBoard.history({ verbose: true })[0]?.before || historyBoard.fen()))) return false;
    }
    return true;
  } catch { return false; }
}

// Context supplies actual original-prefix history when available. Saved review
// provenance may retain an earlier session's gameId; its active generation and
// content signature, not that historical session id, establish compatibility.
function acceptedMove(move, record, context) {
  try {
    if (!UCI.test(move.uci || '') || !move.before || !move.after) return null;
    const provenance = record.provenance, expectedGeneration = context.generationId || context.generation?.id;
    if (expectedGeneration && provenance?.generationId !== expectedGeneration) return null;
    if (provenance && (provenance.uci !== move.uci || provenance.color !== move.color)) return null;
    const expectedSignature = context.gameSignature || context.generation?.game.signature;
    if (expectedSignature && provenance?.gameSignature !== expectedSignature) return null;
    let board;
    if (context.game) {
      const { game, variation, variationPly, ply } = context;
      if (variation) {
        if (!Number.isInteger(variationPly) || variationPly < 1 || variation.moves[variationPly - 1]?.uci !== move.uci) return null;
        if (provenance?.scope === 'variation' && (provenance.gameId !== game.id || provenance.branchBasePly !== variation.basePly || provenance.branchPly !== variationPly)) return null;
        board = positionChess(game, variation.basePly, variation, variationPly - 1);
      } else {
        if (!Number.isInteger(ply) || ply < 1 || game.moves[ply - 1]?.uci !== move.uci) return null;
        board = positionChess(game, ply - 1, null, 0);
      }
      if (board.fen() !== canonical(move.before)) return null;
    } else board = boardFromPosition(record.comparisonBefore?.position || record.before?.position) || new Chess(move.before);
    if (board.fen() !== canonical(move.before)) return null;
    const before = board.fen(), previous = board.history({ verbose: true }).at(-1);
    const beforeBoard = copyBoard(board);
    const legalMoves = board.moves({ verbose: true });
    const actual = described(board.move(uciMove(move.uci)));
    if (actual.after !== canonical(move.after) || actual.color !== move.color) return null;
    const generationId = provenance?.generationId;
    if (!evaluationAt(record.before, before, generationId) || !evaluationAt(record.after, actual.after, generationId)) return null;
    return { move: actual, afterBoard: board, beforeBoard, previous, legalMoves, generationId };
  } catch { return null; }
}

export function explanationLines(move, record, generationId, boards = {}) {
  const warnings = [];
  // Refined root records supersede earlier comparisons; invalid refined evidence
  // is not silently replaced with a contradictory older line.
  const preferred = record.comparisonBefore || record.recheck?.best || record.before;
  const played = record.comparisonAfter || record.recheck?.played;
  const alternative = evaluationAt(preferred, move.before, generationId, boards.beforeBoard) ? replayEvidenceLine(boards.beforeBoard || move.before, preferred.pv) : { moves: [], status: 'stale' };
  let continuation, source;
  if (played) {
    source = 'refined-played-root';
    const legal = evaluationAt(played, move.before, generationId, boards.beforeBoard) && played.pv?.[0] === move.uci ? replayEvidenceLine(boards.beforeBoard || move.before, played.pv) : { moves: [], status: 'stale' };
    continuation = { ...legal, moves: legal.moves.slice(1) };
  } else {
    source = 'after-position';
    continuation = evaluationAt(record.after, move.after, generationId, boards.afterBoard) ? replayEvidenceLine(boards.afterBoard || move.after, record.after.pv) : { moves: [], status: 'stale' };
  }
  if (['invalid', 'stale'].includes(continuation.status)) warnings.push('The stored continuation could not be verified for this move and is not shown.');
  if (['invalid', 'stale'].includes(alternative.status)) warnings.push('The stored alternative could not be verified for this position and is not shown.');
  return { continuation, alternative, source, warnings };
}

// Bounded, legal same-square exchange minimax, allowing either side to decline.
// Used only to reject an unsound fork claim, NEVER to claim a whole-position win.
function exchange(board, square, remaining, budget) {
  if (--budget.left < 0) { budget.complete = false; return 0; }
  const captures = board.moves({ verbose: true }).filter(move => move.to === square && move.captured);
  if (!remaining && captures.length) { budget.complete = false; return 0; }
  let gain = 0;
  for (const capture of captures) {
    board.move(uciMove(toUci(capture)));
    const value = VALUES[capture.captured] + (capture.promotion ? VALUES[capture.promotion] - 1 : 0) - exchange(board, square, remaining - 1, budget);
    board.undo(); gain = Math.max(gain, value);
    if (!budget.complete) break;
  }
  return gain;
}
function checkingFork(move, board, response, record, budget) {
  if (move.piece !== 'n' || !board.isCheck() || record.provisional || record.recheck?.provisional || record.loss > 3 || Math.min(record.before.depth, record.after.depth) < 12) return null;
  const opponent = other(move.color), king = board.board().flat().find(piece => piece?.color === opponent && piece.type === 'k');
  if (!king || !board.attackers(king.square, move.color).includes(move.to)) return null;
  const reply = response[0], capture = response[1];
  if (!reply || !capture || capture.from !== move.to || !['q', 'r'].includes(capture.captured)) return null;
  const victim = board.get(capture.to);
  if (victim?.color !== opponent || victim.type !== capture.captured || !board.attackers(capture.to, move.color).includes(move.to)) return null;
  const replies = board.moves({ verbose: true });
  if (!replies.length || replies.length > EXPLANATION_LIMITS.forkReplies) return null;
  for (const evasion of replies) {
    board.move(uciMove(toUci(evasion)));
    const taking = board.moves({ verbose: true }).find(item => item.from === move.to && item.to === capture.to && item.captured === victim.type && board.get(move.to)?.type === 'n');
    if (!taking) { board.undo(); return null; }
    board.move(uciMove(toUci(taking)));
    const localGain = VALUES[victim.type] - exchange(board, capture.to, EXPLANATION_LIMITS.exchangePlies, budget);
    board.undo(); board.undo();
    if (!budget.complete || localGain < 1) return null;
  }
  return { text: `Your knight checks the king and attacks the ${PIECE_NAMES[victim.type]} on ${capture.to}. After the check is answered, the calculated line captures that ${PIECE_NAMES[victim.type]}.`, squares: [move.to, king.square, capture.to], evidence: { legalCheckReplies: replies.length, allAllowCapture: true, exchangeScope: 'bounded legal recaptures on the capture square only', capture: capture.uci, reply: reply.uci, linePly: 3 } };
}

function observableFacts(move, before, after, previous, legalMoves) {
  const facts = [];
  const add = (kind, text, evidence = {}, squares = [move.from, move.to]) => facts.push({ id: kind, kind, text, level: 'observable', source: 'board-rules', evidence, fen: move.after, squares });
  const terminal = reviewTerminalEvaluation(after);
  if (terminal) {
    const messages = {
      checkmate: `${move.san} is checkmate: ${side(other(move.color))}'s king is in check with no legal reply.`,
      stalemate: `This move produces stalemate: ${side(other(move.color))} has no legal move and is not in check. The board position is drawn.`,
      'insufficient-material': 'This move leaves insufficient mating material under the local rules check; the board position is drawn.',
      'seventy-five-move-rule': 'The halfmove clock reaches 150 without a pawn move or capture. The seventy-five-move automatic draw applies.',
      'fivefold-repetition': 'The recorded move history reaches the same position five times, establishing an automatic repetition draw.',
    };
    add(terminal.reason, messages[terminal.reason], { reason: terminal.reason, legalReplies: after.moves().length, historyPlies: after.history().length });
  } else {
    if (after.isThreefoldRepetition()) add('draw-claim', 'The actual move history makes a threefold-repetition draw claim available. This does not mean a claim was made.', { reason: 'threefold', historyPlies: after.history().length });
    if (after.isDrawByFiftyMoves()) add('draw-claim-fifty', 'The halfmove clock makes a fifty-move draw claim available. Availability is not an automatic game result.', { reason: 'fifty-move', halfmoveClock: Number(after.fen().split(' ')[4]) });
  }
  if (legalMoves.length === 1) add('only-legal-move', 'This was the only legal move in the position.', { legalMoves: legalMoves.map(toUci) });
  if (move.promotion) add('promotion', `The pawn promotes to a ${PIECE_NAMES[move.promotion]} on ${move.to}${move.promotion !== 'q' ? ' (an underpromotion)' : ''}.`, { piece: move.promotion, underpromotion: move.promotion !== 'q' });
  if (/[kq]/.test(move.flags)) {
    const rank = move.color === 'w' ? '1' : '8', kingside = move.flags.includes('k');
    const rookFrom = `${kingside ? 'h' : 'a'}${rank}`, rookTo = `${kingside ? 'f' : 'd'}${rank}`;
    if (before.get(rookFrom)?.type === 'r' && after.get(rookTo)?.type === 'r') add('castling', `${side(move.color)} castles ${kingside ? 'kingside' : 'queenside'}: the king moves from ${move.from} to ${move.to}, and the rook from ${rookFrom} to ${rookTo}.`, { rookFrom, rookTo }, [move.from, move.to, rookFrom, rookTo]);
  }
  if (move.captured) {
    const recapture = previous?.captured && previous.to === move.to && !move.flags.includes('e');
    add(recapture ? 'recapture' : 'capture', `${side(move.color)} ${recapture ? 'recaptures' : 'captures'} ${side(other(move.color))}'s ${PIECE_NAMES[move.captured]} on ${capturedSquare(move)}${move.flags.includes('e') ? ` en passant, landing on ${move.to}` : ''}.`, { captured: move.captured, capturedSquare: capturedSquare(move), previousUci: recapture ? toUci(previous) : null, enPassant: move.flags.includes('e'), materialWinClaimed: false });
  }
  if (!terminal && after.isCheck()) add('check', 'Your move gives check, so the opponent must answer it.', { legalReplies: after.moves().length });
  const home = move.color === 'w' ? { n: ['b1', 'g1'], b: ['c1', 'f1'] } : { n: ['b8', 'g8'], b: ['c8', 'f8'] };
  if (home[move.piece]?.includes(move.from)) add('development', `The ${PIECE_NAMES[move.piece]} leaves its home square ${move.from} for ${move.to}.`, { from: move.from, to: move.to, qualityClaimed: false });
  if (move.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(move.to)) add('central-pawn', `The pawn occupies ${move.to}, one of the four central squares.`, { square: move.to, qualityClaimed: false });
  return facts;
}

function sameReply(board, reply) {
  const trial = copyBoard(board);
  try { return { board: trial, move: described(trial.move(uciMove(reply.uci))) }; } catch { return null; }
}
function immediateComparison(move, before, after, preferred, response, record, budget) {
  if (!preferred || record.provisional || record.recheck?.provisional || Math.min(record.before.depth, record.after.depth) < 12) return null;
  const alternativeBoard = copyBoard(before); alternativeBoard.move(uciMove(preferred.uci));
  const base = { source: 'same-root-comparison', level: 'comparative', fen: move.after, squares: [move.to, preferred.to], evidence: { played: move.uci, preferred: preferred.uci, root: move.before, playedAfter: move.after, preferredAfter: alternativeBoard.fen(), horizon: 'immediate', provesClassification: false } };
  if (alternativeBoard.isCheckmate() && !after.isCheckmate()) return { ...base, id: 'missed-immediate-mate', kind: 'missed-immediate-mate', text: `Your move passes up an immediate checkmate. ${preferred.san} delivers mate instead.` };
  const reply = response[0]; if (!reply) return null;
  const alternativeReply = sameReply(alternativeBoard, reply);
  if (new Chess(reply.after).isCheckmate() && !alternativeReply?.board.isCheckmate()) return { ...base, id: 'immediate-mate-comparison', kind: 'immediate-mate-comparison', text: `Your move allows checkmate on the next reply. ${preferred.san} avoids that immediate mate.`, evidence: { ...base.evidence, reply: reply.uci, linePly: 2 } };
  // Material comparisons are deliberately one-reply and SAME-victim. A distant
  // PV capture or an equal exchange never becomes a causal explanation.
  if (!reply.captured || !after.get(reply.to) || reply.captured === 'p') return null;
  const victim = after.get(reply.to), original = before.get(reply.to);
  const linked = reply.to === move.to && victim.type === move.piece || original?.color === victim.color && original.type === victim.type;
  if (!linked || victim.color !== move.color || alternativeReply?.move.captured === reply.captured) return null;
  const replyBoard = copyBoard(after); replyBoard.move(uciMove(reply.uci));
  const localGain = VALUES[reply.captured] - exchange(replyBoard, reply.to, EXPLANATION_LIMITS.exchangePlies, budget);
  if (!budget.complete || localGain < 1) return null;
  return { ...base, id: 'immediate-capture-comparison', kind: 'immediate-capture-comparison', text: `Your move allows the ${PIECE_NAMES[victim.type]} on ${reply.to} to be taken in the calculated reply. ${preferred.san} avoids that immediate capture.`, squares: [reply.to, preferred.to], evidence: { ...base.evidence, reply: reply.uci, victim: victim.type, localExchangeGain: localGain, scope: 'legal immediate capture and bounded recaptures only, not all replies', linePly: 2 } };
}

// Pure, on-demand explanation. Legal playback establishes sequence validity, not
// the truth of a tactical story: fork claims additionally check every legal reply
// and a bounded local exchange tree. Other material stories are sequence-only.
export function moveMeaning(inputMove, record, context = {}) {
  const accepted = inputMove && record ? acceptedMove(inputMove, record, context) : null;
  if (!accepted) return null;
  const { move, beforeBoard, afterBoard, previous, legalMoves, generationId } = accepted;
  const { continuation, alternative, source, warnings } = explanationLines(move, record, generationId, accepted);
  const facts = observableFacts(move, beforeBoard, afterBoard, previous, legalMoves);
  const budget = { left: EXPLANATION_LIMITS.exchangeNodes, complete: true };
  const fork = checkingFork(move, afterBoard, continuation.moves, record, budget);
  if (fork) facts.push({ id: 'checking-fork', kind: 'checking-fork', ...fork, level: 'consequence', source: 'legal-replies-and-engine-line', fen: move.after });
  const response = continuation.moves, errors = ['mistake', 'blunder', 'miss', 'inaccuracy'].includes(record.type);
  // Read the entire bounded PV BEFORE shortening the display. An exchange that
  // resolves later is not silently labelled a material win at the first segment.
  const captureEvents = response.map((item, index) => ({ item, linePly: index + 2 })).filter(({ item }) => item.captured);
  if (captureEvents.length) {
    const selected = captureEvents.slice(0, 2);
    const text = `In one calculated line, ${selected.map(({ item }) => `${side(item.color)} plays ${named(item)}, capturing a ${PIECE_NAMES[item.captured]} on ${capturedSquare(item)}${item.flags.includes('e') ? ' en passant' : ''}`).join('; then ')}.`;
    facts.push({ id: 'calculated-captures', kind: 'calculated-captures', text, level: 'observable', source, fen: move.after, squares: selected.map(({ item }) => item.to), evidence: { causalReasonEstablished: false, linePly: selected.at(-1).linePly, firstLinePly: selected[0].linePly, events: captureEvents.map(({ item, linePly }) => ({ uci: item.uci, captured: item.captured, color: item.color, linePly })), lastingGainClaimed: false, capped: Boolean(continuation.capped) } });
  }
  const mating = response.find(item => new Chess(item.after).isCheckmate());
  if (mating) facts.push({ id: 'calculated-mate', kind: 'calculated-mate', text: `The stored engine line ends with ${side(mating.color)} delivering checkmate with ${named(mating)}. This is one calculated continuation, not proof that every reply follows it.`, level: 'consequence', source, fen: move.after, squares: [mating.to], evidence: { causalReasonEstablished: false, uci: mating.uci, linePly: response.indexOf(mating) + 2 } });
  const endpoint = response.at(-1), endpointBoard = endpoint ? new Chess(endpoint.after) : null;
  if (endpoint?.captured && endpointBoard.moves({ verbose: true }).some(item => item.to === endpoint.to && item.captured)) facts.push({ id: 'unresolved-exchange', kind: 'unresolved-exchange', text: `The stored line ends with a legal recapture on ${endpoint.to} still available; it does not establish a lasting material gain.`, source, fen: endpoint.after, squares: [endpoint.to], evidence: { capped: Boolean(continuation.capped) } });
  const alternatives = alternative.moves, stronger = alternatives[0]?.uci !== move.uci ? alternatives[0] || null : null;
  const effects = moveEffects(move, beforeBoard, afterBoard);
  const addEffect = (kind, text, evidence, squares) => facts.push({ id: kind, kind, level: 'observable', text, evidence, squares, source: 'board-rules', fen: move.after });
  if (effects.centralControl.length) addEffect('central-control', `From ${move.to}, the ${PIECE_NAMES[move.piece]} controls ${effects.centralControl.join(', ')}.`, { legalDestinations: effects.centralControl, newlyControlled: effects.newlyControlled, qualityClaimed: false }, [move.to, ...effects.centralControl]);
  if (effects.opened.length) addEffect('opened-routes', effects.opened.map(route => `The ${PIECE_NAMES[route.piece]} on ${route.from} gains a ${route.diagonal ? 'diagonal' : 'route'} toward ${route.to}.`).join(' '), { routes: effects.opened, qualityClaimed: false }, effects.opened.flatMap(route => [route.from, ...route.newlyAvailable]));
  if (effects.blocked.length) addEffect('blocked-routes', effects.blocked.map(route => `The pawn on ${route.blockedAt} blocks the ${PIECE_NAMES[route.piece]}'s route from ${route.from} toward ${route.to}.`).join(' '), { routes: effects.blocked, qualityClaimed: false }, [move.to, ...effects.blocked.map(route => route.from)]);
  if (effects.rookActivation) addEffect('rook-activation', `The rook on ${effects.rookActivation.to} gains access to ${effects.rookActivation.gained.join(', ')}.`, effects.rookActivation, [effects.rookActivation.to]);
  const idea = positionalIdea(move, effects, facts.some(fact => fact.kind === 'recapture'));
  if (idea) facts.push({ id: idea.kind, ...idea, level: 'observable', source: 'board-rules', evidence: { supportingFactIds: idea.supports, provesClassification: false }, squares: [move.from, move.to], fen: move.after });
  const comparison = errors ? immediateComparison(move, beforeBoard, afterBoard, stronger, response, record, budget) : null;
  if (comparison) facts.push(comparison);
  if (stronger) {
    const preferredBoard = copyBoard(beforeBoard); preferredBoard.move(uciMove(stronger.uci));
    const difference = observableComparison(move, stronger, effects, moveEffects(stronger, beforeBoard, preferredBoard));
    if (difference) facts.push({ id: difference.kind, ...difference, level: 'comparative', source: 'same-root-position-difference', fen: move.before, squares: [move.to, stronger.to] });
  }
  // Relevance is causal, not chronological. PV events remain in details; a
  // pleasant observable feature does NOT explain an Inaccuracy/Mistake label.
  const decisive = ['checkmate', 'stalemate', 'insufficient-material', 'seventy-five-move-rule', 'fivefold-repetition'].map(kind => facts.find(fact => fact.kind === kind)).find(Boolean);
  const primary = decisive || comparison || (!errors ? facts.find(fact => fact.kind === 'checking-fork') || ['only-legal-move', 'promotion', 'check'].map(kind => facts.find(fact => fact.kind === kind)).find(Boolean) || (idea && facts.find(fact => fact.kind === idea.kind)) || ['castling', 'draw-claim', 'draw-claim-fifty', 'recapture', 'capture', 'development', 'central-pawn'].map(kind => facts.find(fact => fact.kind === kind)).find(Boolean) : null);
  const supporting = primary ? [primary] : [];
  const reason = primary?.text || (stronger ? `The engine prefers ${stronger.san} here. Compare the two continuations to see the difference.` : errors ? 'A concrete reason for this judgment is not established by the stored evidence. Compare the available continuation.' : 'The engine prefers this move here. Show why follows the stored continuation.');
  const provisional = Boolean(record.provisional || record.recheck?.provisional || !record.before.exact && record.before.depth < 12 || !record.after.exact && record.after.depth < 12);
  const neededPly = Math.max(1, ...supporting.map(fact => fact.evidence?.linePly || 1), ...captureEvents.map(event => event.linePly));
  const line = [move, ...response].slice(0, Math.max(EXPLANATION_LIMITS.displayPlies, neededPly));
  const identity = JSON.stringify([EXPLANATION_VERSION, context.game?.id || record.provenance?.gameId || null, generationId || null, move.before, move.uci, move.after, source, line.map(item => item.uci)]);
  return {
    version: EXPLANATION_VERSION, identity, move, facts, reason, selection: { kind: primary?.kind || 'comparison-fallback', level: primary?.level || null, causalComparison: Boolean(comparison) }, supportingFactIds: supporting.map(fact => fact.id),
    response, alternatives, alternative: stronger, line, lineSource: source, lineStatus: continuation.status,
    disclaimer: 'Illustrative engine line, not the recorded game. The opponent may choose another reply; shown captures do not by themselves prove a lasting material win.',
    limitations: 'These are board observations and one accepted calculated line, not proof that every reply follows it. Observable benefits alone do not establish the classification; reached depth and alternative scores may be close.',
    warnings, provisional, cost: { exchangeNodes: EXPLANATION_LIMITS.exchangeNodes - Math.max(0, budget.left), exchangeComplete: budget.complete, maxPvPlies: EXPLANATION_LIMITS.pvPlies },
  };
}
