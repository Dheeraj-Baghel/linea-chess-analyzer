// Regression tests for confirmed review-reliability faults found with the
// five-game diagnostic set (see artifacts/testing/review-comparison/REPORT.md).
// These assert general invariants, never the diagnostic games' final scores.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { createHash } from 'node:crypto';
import { LocalEngine } from '../../src/engine.js';
import { createReviewSession } from '../../src/reviewSession.js';
import { REVIEW_POLICIES } from '../../src/reviewPolicy.js';
import { parseGame, toUci } from '../../src/chess.js';

class FakeWorker {
  static workers = [];
  constructor() { this.commands = []; FakeWorker.workers.push(this); }
  postMessage(command) {
    this.commands.push(command);
    if (command === 'uci') queueMicrotask(() => this.emit('uciok'));
    if (command === 'isready') queueMicrotask(() => this.emit('readyok'));
  }
  emit(line) { this.onmessage?.({ data: line }); }
  terminate() {}
}
const START = new Chess().fen();
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
beforeEach(() => { FakeWorker.workers = []; vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => vi.unstubAllGlobals());
async function engine() { const instance = new LocalEngine(); await instance.ready; return { instance, worker: FakeWorker.workers[0] }; }

describe('search isolation (confirmed fault: shared transposition table)', () => {
  it('clears the hash table and waits for readyok before a fresh search', async () => {
    const { instance, worker } = await engine();
    const before = worker.commands.length;
    const result = instance.analyze({ fen: START, depth: 12, ms: 100, fresh: true }); await flush();
    const sent = worker.commands.slice(before);
    expect(sent.slice(0, 2)).toEqual(['ucinewgame', 'isready']);
    expect(sent.indexOf('ucinewgame')).toBeLessThan(sent.findIndex(command => command.startsWith('go ')));
    worker.emit('info depth 12 multipv 1 score cp 20 pv e2e4'); worker.emit('bestmove e2e4');
    await result; instance.dispose();
  });
  it('does not clear the table for ordinary live analysis', async () => {
    const { instance, worker } = await engine(), before = worker.commands.length;
    const result = instance.analyze({ fen: START, depth: 12, ms: 100 }); await flush();
    expect(worker.commands.slice(before)).not.toContain('ucinewgame');
    worker.emit('info depth 12 multipv 1 score cp 20 pv e2e4'); worker.emit('bestmove e2e4'); await result; instance.dispose();
  });
  it('every shipped review policy isolates its searches', () => {
    for (const policy of Object.values(REVIEW_POLICIES)) expect(policy.freshHash).toBe(true);
  });
  it('review session requests a fresh table for every mainline and verification search', async () => {
    const requests = [];
    const createEngine = () => ({ ready: Promise.resolve(), closed: false, fatal: null, dispose() {}, cancel() {},
      analyze(options) { requests.push(options); const board = new Chess(options.fen); return Promise.resolve({ lines: [{ rank: 1, depth: 16, cp: 0, mate: null, pv: [options.searchMoves?.[0] || toUci(board.moves({ verbose: true })[0])] }], completeLines: [], completeDepth: 16 }); } });
    const session = createReviewSession({ createEngine, signature: async payload => createHash('sha256').update(payload).digest('hex'), elapsedTime: () => 0 });
    session.setGame(parseGame('1. e4 e5 2. Nf3 Nc6 *')); await session.start();
    expect(requests.length).toBeGreaterThan(4); expect(requests.every(options => options.fresh === true)).toBe(true);
    session.dispose();
  });
});

describe('MultiPV gap from one completed iteration (confirmed fault class)', () => {
  it('reports only the deepest iteration in which every requested rank finished', async () => {
    const { instance, worker } = await engine();
    const result = instance.analyze({ fen: START, multiPv: 2, depth: 30, ms: 100 }); await flush();
    worker.emit('info depth 14 multipv 1 score cp 30 pv e2e4');
    worker.emit('info depth 14 multipv 2 score cp 25 pv d2d4');
    // Iteration 15 is interrupted after rank 1 by the time limit.
    worker.emit('info depth 15 multipv 1 score cp 90 pv e2e4');
    worker.emit('info depth 15 multipv 2 score cp 60 upperbound pv d2d4');
    worker.emit('bestmove e2e4');
    const output = await result;
    expect(output.lines.map(line => line.depth)).toEqual([15, 14]);
    expect(output.completeDepth).toBe(14);
    expect(output.completeLines.map(line => [line.rank, line.cp])).toEqual([[1, 30], [2, 25]]);
    instance.dispose();
  });
  it('treats a single legal move as a complete one-rank iteration', async () => {
    const { instance, worker } = await engine();
    const result = instance.analyze({ fen: START, multiPv: 2, ms: 100 }); await flush();
    worker.emit('info depth 20 multipv 1 score cp 0 pv e2e4'); worker.emit('bestmove e2e4');
    expect((await result).completeDepth).toBe(20); instance.dispose();
  });
  it('session takes the gap from one completed iteration, not mixed-depth ranks', async () => {
    // White plays the engine's first choice (verified Best) so the MultiPV=2
    // candidate search runs. Its deepest-per-rank lines mix an interrupted
    // depth-17 rank 1 (+0.20) with a depth-16 rank 2 (-6.00), which would
    // fabricate a huge "Great" gap. The completed depth-16 iteration says the
    // second move is nearly equal (+0.10), so there is no Great-sized gap.
    const game = parseGame('1. e4 *');
    const reply = lines => Promise.resolve({ completeLines: [], completeDepth: lines[0].depth, ...lines.length ? { lines } : {} });
    const analyze = options => {
      if (options.multiPv === 2) return Promise.resolve({
        lines: [{ rank: 1, depth: 17, cp: 20, mate: null, pv: ['e2e4'] }, { rank: 2, depth: 16, cp: -600, mate: null, pv: ['d2d4'] }],
        completeLines: [{ rank: 1, depth: 16, cp: 20, mate: null, pv: ['e2e4'] }, { rank: 2, depth: 16, cp: 10, mate: null, pv: ['d2d4'] }], completeDepth: 16 });
      // Mainline: the start position prefers e4 (+0.20), but the after-e4 search
      // reads -0.40, so the PV-best move appears to lose >1 point and is rechecked.
      // Both root rechecks then agree e4 is best with no loss.
      if (!options.position.includes(' moves ')) return reply([{ rank: 1, depth: 18, cp: 20, mate: null, pv: [options.searchMoves?.[0] || 'e2e4'] }]);
      return reply([{ rank: 1, depth: 16, cp: -40, mate: null, pv: ['e7e5'] }]);
    };
    const scripted = createReviewSession({ createEngine: () => ({ ready: Promise.resolve(), closed: false, fatal: null, dispose() {}, cancel() {}, analyze }), signature: async payload => createHash('sha256').update(payload).digest('hex'), elapsedTime: () => 0 });
    scripted.setGame(game); await scripted.start();
    const check = scripted.getSnapshot().rechecks[1];
    expect(check?.candidates).toBeTruthy();
    expect(check.pvGap).toBeLessThan(12);
    expect(check.gapDepth).toBe(16);
    expect(scripted.getSnapshot().records[1].type).not.toBe('great');
    scripted.dispose();
  });
});

describe('verified best move is not charged for re-sampled search noise (confirmed fault)', () => {
  // Mainline: the PV-best move appears to lose 2.76 points (+0.20 -> -0.10,
  // a noise-sized disagreement), which triggers a recheck. The unrestricted root search again picks the played move. A second
  // restricted search of the SAME move would only re-sample noise (scripted here
  // as -0.45), and previously became nonzero loss and a provisional judgment.
  for (const color of ['w', 'b']) it(`scores the played move as the engine best for ${color === 'w' ? 'White' : 'Black'}`, async () => {
    // Custom start FEN: no opening-book match can pre-empt the label.
    const game = parseGame(color === 'w' ? '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *' : '[SetUp "1"]\n[FEN "4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e3 e5 *');
    const ply = color === 'w' ? 1 : 2, played = game.moves[ply - 1].uci, sign = color === 'w' ? 1 : -1;
    const restricted = [];
    const analyze = options => {
      const moves = options.position.match(/ moves (.*)$/)?.[1].split(' ').length || 0;
      if (options.searchMoves?.length) { restricted.push(options.searchMoves[0]); return Promise.resolve({ lines: [{ rank: 1, depth: 18, cp: -45 * sign, mate: null, pv: [options.searchMoves[0]] }], completeLines: [], completeDepth: 18 }); }
      const legal = new Chess(options.fen).moves({ verbose: true }).map(toUci);
      // Root rechecks (deeper) run only at the disputed ply's root; they agree on the played move.
      if (options.depth > 16) return Promise.resolve({ lines: [{ rank: 1, depth: 18, cp: 20 * sign, mate: null, pv: [moves === ply - 1 ? played : legal[0]] }], completeLines: [], completeDepth: 18 });
      // Before the played move: PV1 is the played move at +0.20 (mover). After it: mover -0.10.
      if (moves === ply - 1) return Promise.resolve({ lines: [{ rank: 1, depth: 16, cp: 20 * sign, mate: null, pv: [played] }], completeLines: [], completeDepth: 16 });
      if (moves === ply) return Promise.resolve({ lines: [{ rank: 1, depth: 16, cp: -10 * sign, mate: null, pv: [legal[0]] }], completeLines: [], completeDepth: 16 });
      return Promise.resolve({ lines: [{ rank: 1, depth: 16, cp: 0, mate: null, pv: [legal[0]] }], completeLines: [], completeDepth: 16 });
    };
    const session = createReviewSession({ createEngine: () => ({ ready: Promise.resolve(), closed: false, fatal: null, dispose() {}, cancel() {}, analyze }), signature: async payload => createHash('sha256').update(payload).digest('hex'), elapsedTime: () => 0 });
    session.setGame(game); await session.start();
    const { records, rechecks } = session.getSnapshot();
    expect(rechecks[ply]).toBeTruthy();
    expect(rechecks[ply].played.sameAsBest).toBe(true);
    expect(restricted).not.toContain(played);
    expect(records[ply].loss).toBe(0);
    expect(records[ply].provisional).toBe(false);
    expect(records[ply].type).toBe('best');
    session.dispose();
  });
});

describe('classifier-3 category definitions', async () => {
  const { classify } = await import('../../src/chess.js');
  const { accuracyFromLoss } = await import('../../src/accuracy.js');
  const { bookMoveEvidence } = await import('../../src/reviewBook.js');
  const ev = (cp, pv = []) => ({ cp, mate: null, depth: 18, pv });
  // Mover = White (sign +1) and mirrored Black (sign -1).
  for (const [color, sign] of [['w', 1], ['b', -1]]) {
    const move = { color, uci: color === 'w' ? 'e2e4' : 'e7e5' };
    it(`${color}: a lost-position blunder after an opponent error is not a Miss`, () => {
      // Mover was already losing/equal: the PV1-PV2 gap only measured the sole defence.
      const result = classify(ev(0), ev(-900 * sign), move, { opponentError: true, pvGap: 40 });
      expect(result.type).toBe('blunder'); expect(result.moverChanceBefore).toBeCloseTo(50, 6);
    });
    it(`${color}: a squandered winning chance after an opponent error is a Miss`, () => {
      const result = classify(ev(500 * sign), ev(-50 * sign), move, { opponentError: true, pvGap: 20 });
      expect(result.type).toBe('miss'); expect(result.moverChanceBefore).toBeGreaterThan(65);
    });
    it(`${color}: Miss labels never change numeric accuracy`, () => {
      const miss = classify(ev(500 * sign), ev(-50 * sign), move, { opponentError: true, pvGap: 20 });
      const plain = classify(ev(500 * sign), ev(-50 * sign), move, {});
      expect(plain.type).toBe('blunder'); expect(miss.loss).toBe(plain.loss); expect(accuracyFromLoss(miss.loss)).toBe(accuracyFromLoss(plain.loss));
    });
  }
  it('Book recognizes positions on the way to a named line, not only named terminals', async () => {
    // 3.Nc3 after the Scandinavian exchange is not itself a named record terminal.
    const book = await bookMoveEvidence(parseGame('1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. Nf3 Nf6 5. d3 Bg4 *'));
    // Plies 1-6 lie on documented Scandinavian lines (5 is a pass-through
    // position, not a named terminal); the dataset ends this branch at 4.Nf3.
    expect([...book.plies]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(book.source.version).toBe('linea-book-2');
  });
  it('Book still stops at the first undocumented position and never on custom starts', async () => {
    const book = await bookMoveEvidence(parseGame('1. e4 e5 2. Qh5 Ke7 3. Qxe5# *'));
    expect(book.plies.has(4)).toBe(false); expect(book.plies.has(5)).toBe(false);
    expect((await bookMoveEvidence(parseGame('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *'))).plies.size).toBe(0);
  });
});
