import { Chess } from 'chess.js';
import { FEEDBACK } from './chess.js';
import { ENGINE_BUILD } from './engineBuild.js';
import { REVIEW_POLICIES, REVIEW_ACCURACY_VERSION, REVIEW_CLASSIFIER_VERSION } from './reviewPolicy.js';
import { accuracyFromLoss, chanceLoss } from './accuracy.js';

// Persist plain evidence, never live handles. A restored checkpoint is untrusted
// until complete identity, legal source positions and contiguous coverage agree.
export function validateReviewCheckpoint(game, snapshot, signature) {
  const generation = snapshot?.generation, policy = generation?.policy;
  if (!generation?.game || !generation.engine || !generation.coverage || !policy || generation.game.signature !== signature || generation.engine.workerSha256 !== ENGINE_BUILD.workerSha256 || generation.engine.wasmSha256 !== ENGINE_BUILD.wasmSha256 || generation.accuracyVersion !== REVIEW_ACCURACY_VERSION || generation.classifierVersion !== REVIEW_CLASSIFIER_VERSION || JSON.stringify(policy) !== JSON.stringify(REVIEW_POLICIES[policy.id])) return false;
  if (!Number.isInteger(snapshot.done) || snapshot.done < 0 || snapshot.done > game.moves.length || snapshot.total !== game.moves.length || generation.game.initialFen !== game.initialFen || generation.game.plies !== game.moves.length || generation.coverage.reviewed !== snapshot.done || generation.coverage.total !== game.moves.length) return false;
  const score = value => value && Number.isFinite(value.cp) && Number.isInteger(value.depth) && value.depth >= 0 && Array.isArray(value.pv);
  const keys = Object.keys(snapshot.records || {}).map(Number);
  if (keys.length !== snapshot.done || keys.some(key => !Number.isInteger(key) || key < 1 || key > snapshot.done)) return false;
  for (const [key, value] of Object.entries(snapshot.positions || {})) {
    const ply = Number(key);
    if (!Number.isInteger(ply) || ply < 0 || ply > Math.min(game.moves.length, snapshot.done + 1) || !score(value) || value.fen !== game.positions[ply] || value.generationId !== generation.id) return false;
  }
  for (let ply = 1; ply <= snapshot.done; ply++) {
    const record = snapshot.records[ply], move = game.moves[ply - 1], provenance = record?.provenance;
    if (!record || !Object.hasOwn(FEEDBACK, record.type)) return false;
    if (!provenance || provenance.generationId !== generation.id || provenance.gameSignature !== signature || provenance.color !== move.color || provenance.uci !== move.uci || provenance.ply !== ply || provenance.accuracyVersion !== REVIEW_ACCURACY_VERSION || provenance.classifierVersion !== REVIEW_CLASSIFIER_VERSION || !score(record.before) || !score(record.after) || record.before.fen !== move.before || record.after.fen !== move.after) return false;
    const loss = chanceLoss(record.comparisonBefore || record.before, record.comparisonAfter || record.after, move.color);
    if (loss === null || !Number.isFinite(record.loss) || !Number.isFinite(record.accuracy) || Math.abs(record.loss - loss) > 1e-9 || Math.abs(record.accuracy - accuracyFromLoss(loss)) > 1e-9) return false;
  }
  for (const [key, check] of Object.entries(snapshot.rechecks || {})) {
    const ply = Number(key), move = game.moves[ply - 1];
    if (!Number.isInteger(ply) || ply < 1 || ply > snapshot.done + 1 || !move) return false;
    const legal = new Set(new Chess(move.before).moves({ verbose: true }).map(value => value.from + value.to + (value.promotion || '')));
    for (const value of [check.best, check.played, check.candidates].filter(Boolean)) if (!score(value) || value.fen !== move.before || !legal.has(value.pv[0])) return false;
    // A same-as-best played record reuses the unrestricted search whose first
    // choice was the played move; otherwise it must be a restricted search.
    if (check.played.sameAsBest ? check.best.pv[0] !== move.uci || check.played.pv[0] !== move.uci : check.played.searchMoves?.length !== 1 || check.played.searchMoves[0] !== move.uci || check.played.pv[0] !== move.uci) return false;
  }
  for (const [key, value] of Object.entries(snapshot.acceptances || {})) {
    const ply = Number(key), move = game.moves[ply - 1];
    if (!Number.isInteger(ply) || ply < 1 || ply > snapshot.done + 1 || !move || !score(value) || value.generationId !== generation.id) return false;
    const board = new Chess(move.after);
    if (!board.moves({ verbose: true }).some(reply => reply.to === move.to && reply.captured && reply.after === value.fen)) return false;
  }
  if (snapshot.done > 0 && !snapshot.positions?.[snapshot.done]) return false;
  return true;
}
