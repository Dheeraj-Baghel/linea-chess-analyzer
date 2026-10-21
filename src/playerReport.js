import { Chess } from 'chess.js';
import { parseGame, FEEDBACK, VALUES, uciMove } from './chess.js';
import { accuracySummary } from './accuracy.js';
import { snapshotCompatible } from './library.js';
import { validateReviewCheckpoint } from './reviewCheckpoint.js';

export const PLAYER_REPORT_VERSION = 'linea-player-report-1';
export const PHASE_RULE_VERSION = 'linea-phase-heuristic-1';
export function reportPhase(move) {
  if (move.number <= 12) return 'opening';
  const material = new Chess(move.before).board().flat().filter(Boolean).reduce((sum, piece) => sum + VALUES[piece.type], 0);
  return material <= 26 ? 'endgame' : 'middlegame';
}
function outcome(result, color) { return result === '1/2-1/2' ? 'draw' : result === '1-0' && color === 'w' || result === '0-1' && color === 'b' ? 'win' : ['1-0', '0-1'].includes(result) ? 'loss' : 'unknown'; }
function errorTheme(move, record) {
  try {
    const board = new Chess(move.after), reply = record.after.pv?.[0] ? board.move(uciMove(record.after.pv[0])) : null;
    if (reply?.captured) return 'Piece safety';
    if (reply?.san.includes('+') || reply?.san.includes('#')) return 'Forcing replies';
  } catch { /* Missing/illegal PV is not evidence of a tactical theme. */ }
  return 'Candidate comparison';
}
export function buildPlayerReport(manifest) {
  const distribution = Object.fromEntries(Object.keys(FEEDBACK).map(type => [type, 0]));
  const results = { win: 0, draw: 0, loss: 0, unknown: 0 }, phases = {}, openings = {}, themes = {}, moments = [], games = [];
  let decisions = 0, processed = 0, failed = 0, skipped = 0, provisional = 0;
  for (const item of manifest.selectedGames) {
    const game = parseGame(item.pgn), color = item.color, result = outcome(game.headers.Result, color);
    results[result]++;
    if (item.status === 'failed') failed++; if (item.status === 'skipped') skipped++;
    const generation = item.snapshot?.generation, declared = manifest.reviewVersions;
    const declaredCompatible = declared && generation && generation.accuracyVersion === declared.accuracy && generation.classifierVersion === declared.classifier && generation.engine.workerSha256 === declared.engine.workerSha256 && generation.engine.wasmSha256 === declared.engine.wasmSha256 && JSON.stringify(generation.policy) === JSON.stringify(declared.policy);
    const compatible = Boolean(declaredCompatible && snapshotCompatible(item.signature, item.snapshot, manifest.quality) && validateReviewCheckpoint(game, item.snapshot, item.signature));
    const summary = compatible ? accuracySummary(game, item.snapshot.records, item.snapshot.generation.id) : null;
    const ready = Boolean(summary?.complete && item.snapshot.generation.status === 'completed');
    if (summary?.reviewed === game.moves.length) processed++;
    if (summary?.provisional) provisional++;
    const rating = Number(game.headers[color === 'w' ? 'WhiteElo' : 'BlackElo']);
    const entry = { key: item.key, signature: item.signature, color, date: item.date, result, format: item.format, opponent: color === 'w' ? game.headers.Black : game.headers.White, observedRating: Number.isFinite(rating) && rating >= 100 ? rating : null, status: item.status, coverage: summary ? { reviewed: summary.reviewed, total: summary.total, provisional: summary.provisional } : { reviewed: 0, total: game.moves.length, provisional: 0 }, accuracy: ready ? summary[color].accuracy : null, reviewGeneration: item.snapshot?.generation.id || null, ready, error: item.error || '' };
    games.push(entry);
    const openingName = item.opening?.source !== 'unavailable' && item.opening?.name ? item.opening.name : 'Not identified';
    openings[openingName] ||= { name: openingName, count: 0, win: 0, draw: 0, loss: 0, unknown: 0 }; openings[openingName].count++; openings[openingName][result]++;
    if (!ready) continue;
    game.moves.forEach((move, index) => {
      if (move.color !== color) return;
      const record = item.snapshot.records[index + 1]; distribution[record.type]++; decisions++;
      const phase = reportPhase(move); phases[phase] ||= { count: 0, loss: 0 }; phases[phase].count++; phases[phase].loss += record.loss;
      if (record.loss > 3) {
        const theme = errorTheme(move, record); themes[theme] ||= { name: theme, count: 0, loss: 0, examples: [] };
        const moment = { key: item.key, color, ply: index + 1, san: move.san, number: move.number, loss: record.loss, classification: record.type, theme };
        themes[theme].count++; themes[theme].loss += record.loss; themes[theme].examples.push(moment); moments.push(moment);
      }
    });
  }
  const readyGames = games.filter(game => game.ready), scores = readyGames.map(game => game.accuracy);
  const dates = games.map(game => game.date).filter(value => Number.isFinite(Date.parse(value))).sort();
  return { version: PLAYER_REPORT_VERSION, phaseRule: PHASE_RULE_VERSION, id: manifest.key, provider: manifest.provider, username: manifest.username, filter: manifest.filter, selected: games.length, imported: manifest.importedCount ?? games.length, processed, completed: readyGames.length, failed, skipped, provisional, dateRange: dates.length ? [dates[0], dates.at(-1)] : null, results, meanGameAccuracy: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null, distribution, distributionDenominator: decisions, phases, openings: Object.values(openings).sort((a, b) => b.count - a.count), themes: Object.values(themes).sort((a, b) => b.loss - a.loss).map(theme => ({ ...theme, examples: theme.examples.sort((a, b) => b.loss - a.loss).slice(0, 3) })), moments: moments.sort((a, b) => b.loss - a.loss).slice(0, 8), games, bestGame: [...readyGames].sort((a, b) => b.accuracy - a.accuracy)[0] || null, provenance: { quality: manifest.quality, createdAt: manifest.createdAt, identity: manifest.reviewVersions } };
}
