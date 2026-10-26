// Freezes an independent validation set from Chess.com's public Published-Data
// API (read-only; serial requests; identifying User-Agent). Only games that
// carry Chess.com's own `accuracies` field are eligible. The five diagnostic
// games, their players and GodL-Dheeraj are excluded entirely.
//
// Split: games are grouped into connected components of players, and whole
// components are assigned to `exploration` or `evaluation`, so no player
// appears in both splits and both sides of a game share a split.
// Frozen BEFORE any source change; never used to choose parameters.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UA = 'Linea local review-validation research (non-commercial, serial requests)';
const EXCLUDED = new Set(['godl-dheeraj', 'doener1000', 'whatupg1', 'zodsaidso', 'nikitakhupatsaria', 'soylentb']);
const DIAGNOSTIC_IDS = new Set(['185626013138', '185433524714', '185382284602', '185297812650', '185273768642']);
const BANDS = [[0, 900], [900, 1300], [1300, 1700], [1700, 2100], [2100, 2500], [2500, 4000]];
const PER_BAND = 8, MAX_REQUESTS = 220, PER_PLAYER = 2;
let requests = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function get(url) {
  if (++requests > MAX_REQUESTS) throw new Error('request cap');
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (response.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (!response.ok) return null;
    await sleep(150);
    return response.json();
  }
  return null;
}
const band = rating => BANDS.findIndex(([lo, hi]) => rating >= lo && rating < hi);
const buckets = BANDS.map(() => []);
const seenGames = new Set(), seenPlayers = new Set(), queue = [], perPlayer = new Map();

async function seed() {
  for (const title of ['GM', 'IM', 'FM']) {
    const data = await get(`https://api.chess.com/pub/titled/${title}`);
    const players = data?.players || [];
    // Deterministic spread through the alphabetical list.
    for (let i = 0; i < Math.min(4, players.length); i++) queue.push(players[Math.floor((i + 0.5) * players.length / 4)].toLowerCase());
  }
  // Club-level seeds: opponents of the diagnostic opponents (not the opponents themselves).
  for (const name of ['doener1000', 'whatupg1', 'zodsaidso', 'nikitakhupatsaria', 'soylentb']) queue.push(`__opponents_of__${name}`);
}

async function visit(name) {
  let opponentsOnly = false;
  if (name.startsWith('__opponents_of__')) { name = name.slice(16); opponentsOnly = true; }
  if (!opponentsOnly && (seenPlayers.has(name) || EXCLUDED.has(name))) return;
  if (!opponentsOnly) seenPlayers.add(name);
  const archives = (await get(`https://api.chess.com/pub/player/${name}/games/archives`))?.archives || [];
  for (const url of archives.slice(-1).reverse()) {
    const games = (await get(url))?.games || [];
    for (const game of games) {
      const white = game.white?.username?.toLowerCase(), black = game.black?.username?.toLowerCase();
      for (const other of [white, black]) if (other && other !== name && !seenPlayers.has(other) && !EXCLUDED.has(other) && queue.length < 400) queue.push(other);
      if (opponentsOnly) continue;
      const id = game.url?.split('/').pop();
      if (!game.accuracies || game.rules !== 'chess' || seenGames.has(id) || DIAGNOSTIC_IDS.has(id) || EXCLUDED.has(white) || EXCLUDED.has(black)) continue;
      if ((perPlayer.get(name) || 0) >= PER_PLAYER) continue;
      let chess;
      try { chess = new Chess(); chess.loadPgn(game.pgn, { strict: false }); } catch { continue; }
      const plies = chess.history().length;
      if (plies < 16 || chess.getHeaders().SetUp === '1') continue;
      const average = (game.white.rating + game.black.rating) / 2, b = band(average);
      if (b < 0 || buckets[b].length >= PER_BAND) continue;
      // Diversity within a band: limit one time class to half the band.
      if (buckets[b].filter(item => item.timeClass === game.time_class).length >= PER_BAND / 2) continue;
      seenGames.add(id); perPlayer.set(name, (perPlayer.get(name) || 0) + 1);
      buckets[b].push({ id, url: game.url, seedPlayer: name, white, black, whiteRating: game.white.rating, blackRating: game.black.rating, whiteResult: game.white.result, blackResult: game.black.result, timeClass: game.time_class, timeControl: game.time_control, rated: game.rated, plies, chesscomAccuracy: { w: game.accuracies.white, b: game.accuracies.black }, pgnSha256: createHash('sha256').update(game.pgn).digest('hex'), pgn: game.pgn });
    }
  }
}

await seed();
while (queue.length && buckets.some(items => items.length < PER_BAND) && requests < MAX_REQUESTS - 3) {
  try { await visit(queue.shift()); } catch (error) { if (error.message === 'request cap') break; }
}
const games = buckets.flat();
// Union-find over players -> components -> alternate assignment by component.
const parent = new Map(), find = x => { while (parent.get(x) !== x) x = parent.get(x); return x; };
for (const game of games) for (const player of [game.white, game.black]) if (!parent.has(player)) parent.set(player, player);
for (const game of games) parent.set(find(game.white), find(game.black));
const components = [...new Set(games.map(game => find(game.white)))].sort();
const hashOf = value => createHash('sha256').update(value).digest('hex');
const split = new Map(components.map(component => [component, parseInt(hashOf(component).slice(0, 8), 16) % 2 ? 'evaluation' : 'exploration']));
for (const game of games) game.split = split.get(find(game.white));
const outDir = path.join(root, 'tests/fixtures/review-comparison');
mkdirSync(outDir, { recursive: true });
const summary = { schema: 'linea-validation-set-1', frozenAt: new Date().toISOString(), source: 'Chess.com Published-Data API (public, read-only); accuracies = Chess.com Game Review values as published', requests,
  selection: { bands: BANDS, perBand: PER_BAND, perPlayerMax: PER_PLAYER, minPlies: 16, rules: 'standard chess only, no custom start, must carry Chess.com accuracies', excludedPlayers: [...EXCLUDED], excludedGames: [...DIAGNOSTIC_IDS] },
  splitRule: 'player connected components hashed (sha256 parity); no player in both splits',
  counts: { total: games.length, exploration: games.filter(g => g.split === 'exploration').length, evaluation: games.filter(g => g.split === 'evaluation').length, byBand: buckets.map(items => items.length) },
  games };
writeFileSync(path.join(outDir, 'validation-set.json'), `${JSON.stringify(summary, null, 1)}\n`);
console.log(JSON.stringify(summary.counts), 'requests', requests);
for (const game of games) console.log(game.split.padEnd(11), game.id, game.timeClass.padEnd(6), `${game.whiteRating}/${game.blackRating}`, game.plies, `${game.whiteResult}/${game.blackResult}`, JSON.stringify(game.chesscomAccuracy));
