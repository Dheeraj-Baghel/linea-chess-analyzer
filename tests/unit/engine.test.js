import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalEngine } from '../../src/engine.js';
import { ENGINE_BUILD } from '../../src/engineBuild.js';

// Transport-only unit harness. Browser tests independently load the real WASM.
class FakeWorker {
  static workers = [];
  constructor(url) { this.url = url; this.commands = []; this.terminated = false; FakeWorker.workers.push(this); }
  postMessage(command) {
    this.commands.push(command);
    if (command === 'uci') queueMicrotask(() => this.emit('uciok'));
    if (command === 'isready') queueMicrotask(() => this.emit('readyok'));
  }
  emit(line) { this.onmessage?.({ data: line }); }
  terminate() { this.terminated = true; }
}
const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
beforeEach(() => { FakeWorker.workers = []; vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function engine() { const instance = new LocalEngine(); await instance.ready; return { instance, worker: FakeWorker.workers[0] }; }

describe('UCI transport and scores', () => {
  it('initializes a dedicated single-thread worker and UCI handshake', async () => {
    const { instance, worker } = await engine();
    expect(worker.url).toBe(ENGINE_BUILD.workerUrl);
    expect(worker.commands).toEqual(['uci', 'setoption name Hash value 24', 'setoption name Threads value 1', 'isready']);
    instance.dispose(); expect(worker.terminated).toBe(true);
  });
  it('streams and returns White-perspective centipawns and legal UCI PVs', async () => {
    const { instance, worker } = await engine(), updates = [];
    const result = instance.analyze({ fen, depth: 12, ms: 100, onUpdate: update => updates.push(update) }); await flush();
    expect(worker.commands).toContain(`position fen ${fen}`); expect(worker.commands).toContain('go depth 12 movetime 100');
    worker.emit('info depth 12 multipv 1 score cp 35 nodes 1234 nps 4567 pv e2e4 e7e5');
    worker.emit('bestmove e2e4');
    expect((await result).lines[0]).toEqual({ rank: 1, depth: 12, cp: 35, mate: null, pv: ['e2e4', 'e7e5'] });
    expect(updates[0].nodes).toBe(1234); instance.dispose();
  });
  it('inverts Black-to-move centipawns and mates into White’s perspective', async () => {
    const { instance, worker } = await engine();
    const result = instance.analyze({ fen: fen.replace(' w ', ' b ') }); await flush();
    worker.emit('info depth 16 score mate 3 pv e7e5'); worker.emit('bestmove e7e5');
    expect((await result).lines[0]).toMatchObject({ mate: -3, cp: -99700 }); instance.dispose();
  });
  it('mate zero favors the opponent of the side that is already mated', async () => {
    const { instance, worker } = await engine();
    const result = instance.analyze({ fen }); await flush();
    worker.emit('info depth 1 score mate 0 pv 0000'); worker.emit('bestmove (none)');
    expect((await result).lines[0]).toMatchObject({ cp: -100000, mate: 0 }); instance.dispose();
  });
  it('collects ranked MultiPV lines and ignores shallower and bound-only updates', async () => {
    const { instance, worker } = await engine();
    const result = instance.analyze({ fen, multiPv: 3 }); await flush();
    expect(worker.commands).toContain('setoption name MultiPV value 3');
    worker.emit('info depth 12 multipv 2 score cp 24 pv d2d4 d7d5');
    worker.emit('info depth 12 multipv 1 score cp 35 pv e2e4 e7e5');
    worker.emit('info depth 10 multipv 1 score cp 60 pv g1f3');
    worker.emit('info depth 14 multipv 1 score cp 90 lowerbound pv g1f3');
    worker.emit('info depth 12 multipv 3 score cp 12 pv g1f3 g8f6');
    worker.emit('bestmove e2e4');
    const data = await result;
    expect(data.lines.map(line => line.rank)).toEqual([1, 2, 3]); expect(data.lines[0].cp).toBe(35); instance.dispose();
  });
  it('reports a missing scored search rather than inventing an evaluation', async () => {
    const { instance, worker } = await engine();
    const result = instance.analyze({ fen }); const rejection = expect(result).rejects.toThrow('No evaluation was returned'); await flush();
    worker.emit('bestmove e2e4'); await rejection; instance.dispose();
  });
  it('sends validated common-root searchmoves without changing the history command', async () => {
    const { instance, worker } = await engine();
    const position = `position fen ${fen} moves e2e4 e7e5`;
    const result = instance.analyze({ fen, position, depth: 18, ms: 2200, searchMoves: ['g1f3'] }); await flush();
    expect(worker.commands).toContain(position); expect(worker.commands).toContain('go depth 18 movetime 2200 searchmoves g1f3');
    worker.emit('info depth 18 score cp 25 pv g1f3'); worker.emit('bestmove g1f3'); await result;
    await expect(instance.analyze({ fen, searchMoves: ['e2e4\nquit'] })).rejects.toThrow('Invalid'); instance.dispose();
  });
});

describe('UCI serialization, stop and worker recovery', () => {
  it('waits for the previous bestmove before issuing the next search', async () => {
    const { instance, worker } = await engine();
    const first = instance.analyze({ fen, depth: 8 }); const second = instance.analyze({ fen, depth: 12 }); await flush();
    expect(worker.commands.filter(command => command.startsWith('go '))).toHaveLength(1);
    worker.emit('info depth 8 score cp 20 pv e2e4'); worker.emit('bestmove e2e4'); await first; await flush();
    expect(worker.commands.filter(command => command.startsWith('go '))).toHaveLength(2);
    worker.emit('info depth 12 score cp 30 pv d2d4'); worker.emit('bestmove d2d4'); expect((await second).bestMove).toBe('d2d4'); instance.dispose();
  });
  it('stop rejects the old position, ignores late info and waits for acknowledgment', async () => {
    const { instance, worker } = await engine(), controller = new AbortController(), update = vi.fn();
    const first = instance.analyze({ fen, signal: controller.signal, onUpdate: update });
    const rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' }); await flush(); controller.abort();
    const second = instance.analyze({ fen, depth: 13 }); await flush();
    worker.emit('info depth 12 score cp 900 pv e2e4'); expect(update).not.toHaveBeenCalled();
    expect(worker.commands.filter(command => command.startsWith('go '))).toHaveLength(1); expect(worker.commands).toContain('stop');
    worker.emit('bestmove e2e4'); await rejection; await flush();
    worker.emit('info depth 13 score cp 35 pv d2d4'); worker.emit('bestmove d2d4'); expect((await second).lines[0].cp).toBe(35); instance.dispose();
  });
  it('does not issue any search for a pre-aborted request', async () => {
    const { instance, worker } = await engine(), controller = new AbortController(); controller.abort();
    await expect(instance.analyze({ fen, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.commands.some(command => command.startsWith('go '))).toBe(false); instance.dispose();
  });
  it('a fatal worker error rejects the current and future search without stale scores', async () => {
    const { instance, worker } = await engine(); const result = instance.analyze({ fen });
    const rejection = expect(result).rejects.toThrow('could not start'); await flush(); worker.onerror(); await rejection;
    expect(instance.fatal).toBeInstanceOf(Error); expect(worker.terminated).toBe(true);
    await expect(instance.analyze({ fen })).rejects.toThrow('could not start');
  });
  it('disposing an engine aborts outstanding work and releases listeners', async () => {
    const { instance, worker } = await engine(); const result = instance.analyze({ fen });
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' }); await flush(); instance.dispose(); await rejection;
    expect(worker.terminated).toBe(true); expect(instance.listeners.size).toBe(0); expect(instance.failures.size).toBe(0);
  });
  it('a stop timeout quarantines the worker so the next search cannot consume an old bestmove', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { instance, worker } = await engine(), controller = new AbortController();
    const result = instance.analyze({ fen, signal: controller.signal }); const rejection = expect(result).rejects.toThrow('did not acknowledge stop');
    await flush(); controller.abort(); await vi.advanceTimersByTimeAsync(6000); await rejection;
    expect(instance.closed).toBe(true); expect(worker.terminated).toBe(true);
  });
});
