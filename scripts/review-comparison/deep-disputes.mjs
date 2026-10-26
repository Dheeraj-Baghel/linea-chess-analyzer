// Independent deeper analysis of selected disputed plies with the OFFICIAL full
// Stockfish 19 binary (not the shipped browser lite build). Supporting evidence
// only: a stronger bounded search is not a proof.
//
// For each disputed ply: same root and complete history (`position fen ... moves`),
// fresh hash, then (1) unrestricted MultiPV=2 and (2) `searchmoves <played>`,
// each with an identical fixed NODE budget so the two are comparable and
// reproducible. PVs are retained. Loss uses Linea's own chanceLoss.
//
// Usage: node scripts/review-comparison/deep-disputes.mjs <stockfish-binary> <label> [nodes]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chanceLoss, whiteWinPercent } from '../../src/accuracy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [binary, label = 'l1-correctness', nodesArg] = process.argv.slice(2);
const NODES = Number(nodesArg || 40_000_000), THREADS = 1, HASH = 256;
const analysis = JSON.parse(readFileSync(path.join(root, 'artifacts/testing/review-comparison', label, 'analysis.json'), 'utf8'));
const SERIOUS = new Set(['mistake', 'blunder', 'miss']);

// Selection rule (fixed before running): every readable reference label whose
// serious/non-serious status disagrees with Linea, plus every Linea Miss and
// every ply where the readable reference says Great or Miss.
const selected = Object.entries(analysis.perPly).flatMap(([id, rows]) => rows.filter(row => SERIOUS.has(row.chesscom) !== SERIOUS.has(row.linea) || row.linea === 'miss' || ['great', 'miss'].includes(row.chesscom)).map(row => ({ id, ...row })));

const child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = []; let wait = null;
createInterface({ input: child.stdout }).on('line', line => { lines.push(line); if (wait?.re.test(line)) { const resolve = wait.resolve; wait = null; resolve(); } });
const until = re => new Promise(resolve => { wait = { re, resolve }; });
const send = command => child.stdin.write(`${command}\n`);
send('uci'); await until(/^uciok/);
const id = lines.find(line => line.startsWith('id name'))?.slice(8);
const evalFile = lines.find(line => line.includes('name EvalFile'))?.split('default ')[1];
send(`setoption name Threads value ${THREADS}`); send(`setoption name Hash value ${HASH}`); send('isready'); await until(/^readyok/);

const parse = (line, sign) => {
  const [, kind, raw] = /score (cp|mate) (-?\d+)/.exec(line); const value = Number(raw);
  const mate = kind === 'mate' ? value * sign : null;
  return { depth: Number(/ depth (\d+)/.exec(line)[1]), rank: Number(/ multipv (\d+)/.exec(line)?.[1] || 1), cp: mate === null ? value * sign : (mate > 0 ? 1 : -1) * (100000 - Math.abs(mate) * 100), mate, nodes: Number(/ nodes (\d+)/.exec(line)[1]), pv: / pv (.+)$/.exec(line)[1].split(' ') };
};
async function search(position, sign, multiPv, searchMoves = '') {
  send('ucinewgame'); send('isready'); await until(/^readyok/);
  lines.length = 0;
  send(`setoption name MultiPV value ${multiPv}`); send(position);
  send(`go nodes ${NODES}${searchMoves ? ` searchmoves ${searchMoves}` : ''}`);
  await until(/^bestmove/);
  const exact = lines.filter(line => line.startsWith('info depth') && / pv /.test(line) && !/bound/.test(line)).map(line => parse(line, sign));
  // One completed iteration: the deepest depth at which all requested ranks exist.
  const depths = [...new Set(exact.map(line => line.depth))].sort((a, b) => b - a);
  const depth = depths.find(d => exact.filter(line => line.depth === d).length >= multiPv) ?? depths[0];
  return exact.filter(line => line.depth === depth).sort((a, b) => a.rank - b.rank);
}

const manifest = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/review-comparison/linea-review-comparison-manifest.json'), 'utf8'));
const results = [];
for (const row of selected) {
  const game = manifest.games.find(item => item.id === row.id);
  const history = game.ledger.slice(0, row.ply - 1).map(move => move.uci);
  const position = `position startpos${history.length ? ` moves ${history.join(' ')}` : ''}`;
  const fen = game.ledger[row.ply - 1].before, sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  const started = Date.now();
  const top = await search(position, sign, 2);
  const played = top[0].pv[0] === row.uci ? top[0] : (await search(position, sign, 1, row.uci))[0];
  const loss = chanceLoss(top[0], played, row.color);
  const moverChance = (value => sign > 0 ? value : 100 - value)(whiteWinPercent(top[0]));
  const gap = top[1] ? chanceLoss(top[0], top[1], row.color) : null;
  const deepLabel = loss <= 1 ? (top[0].pv[0] === row.uci ? 'best' : 'excellent') : loss <= 3 ? 'good' : loss <= 7 ? 'inaccuracy' : loss <= 15 ? 'mistake' : 'blunder';
  results.push({ id: row.id, ply: row.ply, color: row.color, san: row.san, uci: row.uci, fen, history: history.join(' '), chesscom: row.chesscom, linea: row.linea, lineaLoss: row.loss, deep: { depth: top[0].depth, nodes: top[0].nodes, best: top[0].pv[0], bestScore: top[0].mate ?? top[0].cp, bestIsMate: top[0].mate !== null, second: top[1]?.pv[0] ?? null, secondScore: top[1] ? top[1].mate ?? top[1].cp : null, playedScore: played.mate ?? played.cp, playedIsMate: played.mate !== null, playedDepth: played.depth, loss, gap, moverChanceBefore: moverChance, baseLabel: deepLabel, bestPv: top[0].pv.slice(0, 12).join(' '), playedPv: played.pv.slice(0, 12).join(' ') }, elapsedMs: Date.now() - started });
  const r = results.at(-1).deep;
  console.log(`${row.id} ply ${String(row.ply).padStart(3)} ${row.color} ${row.san.padEnd(7)} cc=${row.chesscom.padEnd(10)} linea=${row.linea.padEnd(10)} deep d${r.depth} best ${r.best}${r.bestIsMate ? ' M' : ' '}${r.bestScore} played ${r.playedIsMate ? 'M' : ''}${r.playedScore} loss ${r.loss.toFixed(1)} (linea ${row.loss.toFixed(1)}) chance ${r.moverChanceBefore.toFixed(0)} gap ${r.gap?.toFixed(1) ?? '—'} -> ${r.baseLabel}`);
}
send('quit');
const binarySha = createHash('sha256').update(readFileSync(binary)).digest('hex');
writeFileSync(path.join(root, 'artifacts/testing/review-comparison', `deep-disputes-${label}.json`), `${JSON.stringify({ engine: { id, evalFile, binarySha256: binarySha, release: 'https://github.com/official-stockfish/Stockfish/releases/tag/sf_19 (stockfish-macos-universal.tar.gz sha256 a1f0e3bcc5a6927a11fe6fc8e54a779754645f3c2bae2cf13420fd1957adaa77)', threads: THREADS, hashMb: HASH, nodesPerSearch: NODES, freshHashPerSearch: true }, selectionRule: 'readable reference label with serious/non-serious disagreement vs Linea, plus all Linea Miss and all reference Great/Miss', results }, null, 1)}\n`);
