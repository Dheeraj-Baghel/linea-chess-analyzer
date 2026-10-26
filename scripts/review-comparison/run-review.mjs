// Reproducible headless game review for the diagnostic comparison set.
//
// Runs Linea's REAL review pipeline (src/reviewSession.js -> src/engine.js
// LocalEngine -> classifier/accuracy/rating) unchanged. Only the browser Worker
// is replaced by a Node shim that drives the byte-identical shipped Stockfish.js
// 19.0.1 lite-single build (JS + WASM hashes verified against ENGINE_BUILD)
// over its own stdin/stdout UCI CLI. Threads=1 and Hash=24 are set by
// LocalEngine exactly as in the browser.
//
// Usage: node scripts/review-comparison/run-review.mjs --label baseline [--games id,id] [--runs 1] [--quality balanced] [--set diagnostic|validation] [--split exploration|evaluation]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((out, value, index, all) => value.startsWith('--') ? [...out, [value.slice(2), all[index + 1]?.startsWith('--') || all[index + 1] === undefined ? 'true' : all[index + 1]]] : out, []));
const label = args.label || 'run';
const quality = args.quality || 'balanced';
const runs = Number(args.runs || 1);
const sha = buffer => createHash('sha256').update(buffer).digest('hex');

const server = await createServer({ root, configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
const load = file => server.ssrLoadModule(file);
const [{ ENGINE_BUILD }, { createReviewSession }, { parseGame }, { reviewExport }, policy, { reviewCategoryCounts }] = await Promise.all(['/src/engineBuild.js', '/src/reviewSession.js', '/src/chess.js', '/src/gameRating.js', '/src/reviewPolicy.js', '/src/review.js'].map(load));

// Engine identity: refuse to run anything but the pinned shipped build.
const jsBytes = readFileSync(path.join(root, 'public/engine/stockfish-19-lite-single.js'));
const wasmBytes = readFileSync(path.join(root, 'public/engine/stockfish-19-lite-single.wasm'));
if (sha(jsBytes) !== ENGINE_BUILD.workerSha256 || sha(wasmBytes) !== ENGINE_BUILD.wasmSha256) throw new Error('Shipped engine does not match ENGINE_BUILD hashes.');
const engineDir = path.join(os.tmpdir(), `linea-sf19-${ENGINE_BUILD.workerSha256.slice(0, 12)}`);
mkdirSync(engineDir, { recursive: true });
const cliPath = path.join(engineDir, 'stockfish-19-lite-single.cjs');
if (!existsSync(cliPath)) { copyFileSync(path.join(root, 'public/engine/stockfish-19-lite-single.js'), cliPath); copyFileSync(path.join(root, 'public/engine/stockfish-19-lite-single.wasm'), path.join(engineDir, 'stockfish-19-lite-single.wasm')); }
if (sha(readFileSync(cliPath)) !== ENGINE_BUILD.workerSha256 || sha(readFileSync(path.join(engineDir, 'stockfish-19-lite-single.wasm'))) !== ENGINE_BUILD.wasmSha256) throw new Error('Engine copy hash mismatch.');

let spawned = 0;
globalThis.Worker = class NodeStockfishWorker {
  constructor() {
    spawned++;
    this.child = spawn(process.execPath, [cliPath], { cwd: engineDir, stdio: ['pipe', 'pipe', 'inherit'] });
    createInterface({ input: this.child.stdout }).on('line', line => this.onmessage?.({ data: line }));
    this.child.on('error', error => this.onerror?.(error));
  }
  postMessage(command) { if (!this.child.killed) this.child.stdin.write(`${command}\n`); }
  terminate() { this.child.kill('SIGKILL'); }
};

const set = args.set || 'diagnostic';
let games;
if (set === 'validation') {
  const frozen = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/review-comparison/validation-set.json'), 'utf8'));
  games = frozen.games.filter(item => !args.split || item.split === args.split).map(item => Object.assign(parseGame(item.pgn), { validation: item }));
} else {
  const pgnText = readFileSync(path.join(root, 'tests/fixtures/review-comparison/linea-review-comparison-games.pgn'), 'utf8');
  games = pgnText.split(/\n(?=\[Event )/).map(value => value.trim()).filter(Boolean).map(pgn => parseGame(pgn));
}
const wanted = args.games ? args.games.split(',') : null;
const outDir = path.join(root, 'artifacts/testing/review-comparison', set === 'validation' ? `validation-${label}` : label);
mkdirSync(outDir, { recursive: true });

let gitRevision = null;
try { gitRevision = (await import('node:child_process')).execSync('git rev-parse HEAD', { cwd: root }).toString().trim(); } catch { /* not a git checkout */ }
const environment = {
  label, set, split: args.split || null, quality, runs, gitRevision, node: process.version, platform: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0]?.model, cpus: os.cpus().length,
  engine: { ...ENGINE_BUILD, nnue: 'nn-61e7af4bb97d.nnue (EvalFile default reported by the build)', harness: 'Node CLI mode of the identical JS/WASM; Threads=1, Hash=24 MB set by LocalEngine' },
  versions: { policy: policy.REVIEW_POLICY_VERSION, classifier: policy.REVIEW_CLASSIFIER_VERSION, accuracy: policy.REVIEW_ACCURACY_VERSION, reviewPolicy: policy.REVIEW_POLICIES[quality] },
  startedAt: new Date().toISOString(),
};

const summaryRows = [];
for (let run = 1; run <= runs; run++) {
  for (const game of games) {
    const id = game.validation?.id || /\/(\d{9,})/.exec(game.headers.Link)?.[1];
    if (wanted && !wanted.includes(id)) continue;
    const session = createReviewSession();
    session.setQuality(quality);
    session.setGame(game);
    const began = performance.now(), before = spawned;
    await session.start();
    const elapsedMs = Math.round(performance.now() - began);
    const snapshot = session.getSnapshot();
    if (snapshot.error || snapshot.generation?.status !== 'completed') throw new Error(`Review failed for ${id}: ${snapshot.error || snapshot.generation?.status}`);
    const evidence = reviewExport(game, snapshot);
    const counts = reviewCategoryCounts(game, snapshot.records, snapshot.generation.id);
    const searches = [...Object.values(snapshot.positions), ...Object.values(snapshot.acceptances), ...Object.values(snapshot.rechecks).flatMap(check => [check.best, check.played, check.candidates].filter(Boolean))].filter(value => value.source === 'engine');
    const depths = searches.map(value => value.depth);
    const run_meta = { id, run, elapsedMs, enginesSpawned: spawned - before, searches: searches.length, nodes: searches.reduce((sum, value) => sum + (value.nodes || 0), 0), depth: { min: Math.min(...depths), max: Math.max(...depths), mean: depths.reduce((a, b) => a + b, 0) / depths.length, belowTarget: searches.filter(value => value.depth < value.targetDepth).length }, rechecks: Object.keys(snapshot.rechecks).length, unresolved: Object.values(snapshot.rechecks).filter(check => check.provisional).length };
    writeFileSync(path.join(outDir, `${id}-run${run}.json`), `${JSON.stringify({ environment, run: run_meta, validation: game.validation ? { ...game.validation, pgn: undefined } : undefined, categoryCounts: counts, evidence })}\n`);
    const acc = evidence.accuracy, elo = evidence.experimentalGameElo;
    summaryRows.push({ ...run_meta, split: game.validation?.split, reference: game.validation?.chesscomAccuracy, accuracy: { w: acc.w.accuracy, b: acc.b.accuracy }, complete: acc.complete, provisional: acc.provisional, elo: { w: elo.w.value, b: elo.b.value, reason: elo.w.reason || elo.b.reason } });
    console.log(`${label} run${run} ${id} ${elapsedMs}ms acc W ${acc.w.accuracy?.toFixed(2)} B ${acc.b.accuracy?.toFixed(2)} elo ${elo.w.value}/${elo.b.value} prov ${acc.provisional} rechecks ${run_meta.rechecks} unresolved ${run_meta.unresolved} depth ${run_meta.depth.min}-${run_meta.depth.max} mean ${run_meta.depth.mean.toFixed(1)} below ${run_meta.depth.belowTarget}/${searches.length}`);
    session.dispose();
  }
}
writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify({ environment: { ...environment, finishedAt: new Date().toISOString() }, rows: summaryRows }, null, 1)}\n`);
await server.close();
process.exit(0);
