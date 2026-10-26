// Runs the browser accuracy-v2 native fixture list through the real review
// session and the shipped engine (Node harness), with the same assertions, so
// policy changes can be checked against the full real-engine scenario set.
// Usage: node scripts/review-comparison/native-fixtures.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const server = await createServer({ root, configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
const [{ ENGINE_BUILD }, { createReviewSession }, { parseGame }, { accuracySummary }, { experimentalGameRatings }] = await Promise.all(['/src/engineBuild.js', '/src/reviewSession.js', '/src/chess.js', '/src/accuracy.js', '/src/gameRating.js'].map(file => server.ssrLoadModule(file)));
const cli = path.join(os.tmpdir(), `linea-sf19-${ENGINE_BUILD.workerSha256.slice(0, 12)}`, 'stockfish-19-lite-single.cjs');
globalThis.Worker = class { constructor() { this.child = spawn(process.execPath, [cli], { cwd: path.dirname(cli), stdio: ['pipe', 'pipe', 'inherit'] }); createInterface({ input: this.child.stdout }).on('line', line => this.onmessage?.({ data: line })); } postMessage(c) { this.child.stdin.write(`${c}\n`); } terminate() { this.child.kill('SIGKILL'); } };
const read = file => readFileSync(path.join(root, 'tests/fixtures', file), 'utf8');
const fixtures = [
  ['short-loss', '[White "Fixture White"]\n[Black "Fixture Black"]\n\n1. f3 e5 2. g4 Qh4# 0-1'],
  ['Black-start-mate', '[SetUp "1"]\n[FEN "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 34"]\n\n34... Qh4# 0-1'],
  ['White-mate', '[SetUp "1"]\n[FEN "7k/8/5KQ1/8/8/8/8/8 w - - 0 1"]\n\n1. Qg7# 1-0'],
  ['underpromotion', '[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=N 1/2-1/2'],
  ['endgame', '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/P7/K7 w - - 0 1"]\n\n1. a4 Kg7 2. Ka2 Kf6 *'],
  ['en-passant', '1. e4 a6 2. e5 d5 3. exd6 *'],
  ['castling', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O *'],
  ['history-repetition', '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. e4 *'],
  ['forced-Black', '[SetUp "1"]\n[FEN "7k/8/6K1/8/8/8/8/7R b - - 0 34"]\n\n34... Kg8 *'],
  ['missed-mate', '1. f3 e5 2. g4 Nc6 *'],
  ['stalemate', '[SetUp "1"]\n[FEN "7k/8/5KQ1/8/8/8/8/8 w - - 0 1"]\n\n1. Qf7 1/2-1/2'],
  ['long-losing-endgame', read('accuracy-v2-long-endgame.pgn')],
  ['verified-sacrifice', read('stockfish19-drawing-sacrifice.pgn')],
  ['historical-reference-prefix', read('kasparov-topalov-1999-prefix.pgn')],
];
const failures = []; let total = 0;
const check = (ok, message) => { if (!ok) failures.push(message); };
for (const [name, pgn] of fixtures) {
  for (const quality of ['short-loss', 'verified-sacrifice', 'historical-reference-prefix'].includes(name) ? ['quick', 'balanced', 'deeper'] : ['balanced']) {
    const game = parseGame(pgn), session = createReviewSession(); session.setGame(game); session.setQuality(quality);
    const began = performance.now(); await session.start(); const state = session.getSnapshot(); session.dispose();
    const ms = Math.round(performance.now() - began); total += ms;
    const summary = accuracySummary(game, state.records, state.generation?.id), ratings = experimentalGameRatings(game, state), tag = `${name}/${quality}`;
    check(state.error === '', `${tag}: error ${state.error}`); check(state.done === state.total, `${tag}: incomplete`);
    for (const record of Object.values(state.records)) {
      check(record.accuracy >= 0 && record.accuracy <= 100, `${tag}: accuracy range`);
      if (record.type === 'best') check(record.loss <= 1, `${tag}: best with loss ${record.loss}`);
      if (record.type === 'brilliant') check(record.sacrificeCheck.status === 'verified', `${tag}: unverified brilliant`);
      if (record.recheck) { check(record.recheck.best.multiPv === 1 && record.recheck.played.multiPv === 1, `${tag}: recheck multipv`); check(record.recheck.played.sameAsBest ? record.recheck.best.pv[0] === record.provenance.uci : record.recheck.played.searchMoves?.[0] === record.provenance.uci, `${tag}: played recheck identity`); }
    }
    if (name === 'short-loss') { check(state.records[3].loss > 15, `${tag}: Qh4 loss`); check(summary.w.accuracy < summary.b.accuracy, `${tag}: side order`); }
    if (name === 'White-mate') check(state.records[1].after.winner === 'w' && state.records[1].after.mate === 0 && state.records[1].after.source === 'rules', `${tag}: terminal mate`);
    if (name === 'Black-start-mate') check(summary.w.total === 0, `${tag}: Black start`);
    if (name === 'history-repetition') check(state.positions[8].source === 'engine' && state.positions[8].claims.threefold, `${tag}: repetition claim`);
    if (name === 'forced-Black') check(state.records[1].type === 'forced', `${tag}: forced`);
    if (name === 'missed-mate') { check(state.records[4].loss > 7, `${tag}: missed mate loss`); check(state.records[4].type === 'miss', `${tag}: missed mate label ${state.records[4].type}`); }
    if (name === 'stalemate') check(state.records[1].after.reason === 'stalemate' && state.records[1].after.cp === 0, `${tag}: stalemate`);
    if (name === 'long-losing-endgame') check(ratings.w.value >= 100 && ratings.b.value >= 100 && ratings.w.calibrated === false, `${tag}: ratings ${ratings.w.value}/${ratings.b.value} ${ratings.w.reason || ''}`);
    if (name === 'verified-sacrifice') check(state.records[1].type === 'brilliant', `${tag}: brilliant ${state.records[1].type}`);
    console.log(`${tag.padEnd(36)} ${String(ms).padStart(6)} ms  W ${summary.w.accuracy?.toFixed(1) ?? '—'}  B ${summary.b.accuracy?.toFixed(1) ?? '—'}`);
  }
}
console.log(`total review ms ${total}; failures ${failures.length}`); for (const failure of failures) console.log(`  FAIL ${failure}`);
await server.close(); process.exit(failures.length ? 1 : 0);
