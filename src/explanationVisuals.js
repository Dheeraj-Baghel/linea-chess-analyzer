// Explanation visuals are presentation-only, separate from manual annotations
// and live-engine recommendations. Past moves use highlights on the after-board;
// move arrows require the correct before-board and a legal side-to-move move.
export function legalExplanationArrow(board, move, kind, label) {
  if (!move || board.fen() !== move.before || board.get(move.from)?.color !== board.turn()) return null;
  const legal = board.moves({ square: move.from, verbose: true }).some(candidate => candidate.to === move.to && candidate.promotion === move.promotion);
  return legal ? { from: move.from, to: move.to, illustrative: true, explanationKind: kind, label } : null;
}
export function ideaHighlights(explanation, board) {
  if (!explanation || board.fen() !== explanation.move.after) return [];
  const selected = explanation.facts.filter(fact => explanation.supportingFactIds.includes(fact.id));
  const facts = selected.flatMap(fact => [fact, ...(fact.supports || []).flatMap(id => explanation.facts.filter(item => item.id === id))]);
  const squares = new Set();
  for (const fact of facts) {
    if (fact.kind === 'opened-routes') { for (const route of fact.evidence.routes) squares.add(route.from); }
    else if (fact.kind === 'central-control') { for (const square of fact.evidence.legalDestinations) squares.add(square); }
    else if (fact.kind === 'checking-fork') { for (const square of fact.squares) squares.add(square); }
    else if (fact.kind === 'rook-activation') squares.add(fact.evidence.to);
  }
  return [...squares].map(square => ({ square, label: 'Square supporting the selected move explanation' }));
}
export function illustrationVisuals(illustration, board) {
  const { explanation, step, line, lineMode = 'played', view = 'idea' } = illustration;
  if (step === 0) {
    const arrow = legalExplanationArrow(board, line[0], lineMode === 'alternative' ? 'alternative' : 'played', lineMode === 'alternative' ? 'Preferred alternative from the before-position' : 'The selected move from its before-position');
    return { arrows: arrow ? [arrow] : [], marks: [] };
  }
  if (lineMode === 'played' && view === 'idea' && step === 1) return { arrows: [], marks: ideaHighlights(explanation, board) };
  const next = line[step], opponent = next?.color !== explanation.move.color;
  const label = opponent ? `Opponent's suggested reply in the ${lineMode} continuation` : `Next mover continuation in the ${lineMode} line`;
  const arrow = legalExplanationArrow(board, next, opponent ? 'reply' : 'continuation', label);
  return { arrows: arrow ? [arrow] : [], marks: [] };
}

// Restore the user's preview before pressing Next without confusing it with
// an explanation of the move just played. Read accepted current-root evidence;
// never draw the preceding move's before-PV on its after-position.
export function nextMoveRecommendation(board, { generationId, nextRecord, position, currentRecord }) {
  const accepted = record => record && (!generationId || record.provenance?.generationId === generationId);
  const candidates = [
    accepted(nextRecord) ? nextRecord.comparisonBefore || nextRecord.recheck?.best || nextRecord.before : null,
    position,
    accepted(currentRecord) ? currentRecord.after : null,
  ];
  for (const evaluation of candidates) {
    if (!evaluation || !Number.isFinite(evaluation.cp) || evaluation.fen !== board.fen() || evaluation.generationId && evaluation.generationId !== generationId) continue;
    const uci = evaluation.pv?.[0];
    if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci) || board.get(uci.slice(0, 2))?.color !== board.turn()) continue;
    const move = board.moves({ square: uci.slice(0, 2), verbose: true }).find(move => move.to === uci.slice(2, 4) && (move.promotion || '') === uci.slice(4));
    if (move) return { from: move.from, to: move.to, best: true, recommendation: true, san: move.san, label: `Best next move for ${move.color === 'w' ? 'White' : 'Black'}: ${move.san}` };
  }
  return null;
}
