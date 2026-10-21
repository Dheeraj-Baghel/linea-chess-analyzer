import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { createReviewSession } from '../../src/reviewSession.js';
import { parseGame } from '../../src/chess.js';
import { createEngineCoordinator } from '../../src/engineCoordinator.js';
import { reviewIdentity, snapshotCompatible } from '../../src/library.js';
import { reviewGamePayload, reviewGameSignature } from '../../src/reviewPolicy.js';
import { validateReviewCheckpoint } from '../../src/reviewCheckpoint.js';
import { safeWorkspaceDraft } from '../../src/workspaceDraft.js';
import { readWorkspaceRoute, workspaceUrl } from '../../src/workspaceRoute.js';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function scored(options) { const move = new Chess(options.fen).moves({ verbose: true })[0]; return { lines: [{ rank: 1, depth: options.depth, cp: 0, mate: null, pv: [move.from + move.to + (move.promotion || '')] }] }; }
function harness() {
  const analyze = vi.fn(async options => scored(options));
  const createEngine = vi.fn(() => ({ ready: Promise.resolve(), analyze, dispose: vi.fn(), closed: false }));
  return { analyze, createEngine, session: createReviewSession({ createEngine }) };
}
const game = () => parseGame('1. e4 e5 2. Nf3 Nc6 *');
function fakeLocks() {
  let busy = false;
  return { request: vi.fn(async (_, options, callback) => {
    if (busy && options.ifAvailable) return callback(null);
    busy = true; try { return await callback({ name: 'linea-stockfish-job-owner' }); } finally { busy = false; }
  }) };
}

describe('versioned review restoration', () => {
  it('restores a complete result into a new session without an engine or recomputation', async () => {
    const first = harness(), original = game(); first.session.setGame(original); await first.session.start(); const saved = structuredClone(first.session.getSnapshot()); first.session.dispose();
    const next = harness(); next.session.setGame(parseGame(original.rawPgn));
    expect(await next.session.restore(saved)).toBe(true); expect(next.createEngine).not.toHaveBeenCalled();
    expect(next.session.getSnapshot()).toMatchObject({ done: 4, running: false, generation: { status: 'completed', id: saved.generation.id } });
    await next.session.start(); expect(next.createEngine).not.toHaveBeenCalled(); next.session.dispose();
  });
  it('rejects changed engine/version/game, noncontiguous records and incorrect move evidence', async () => {
    const h = harness(), original = game(); h.session.setGame(original); await h.session.start(); const source = h.session.getSnapshot(), signature = await reviewGameSignature(reviewGamePayload(original));
    expect(validateReviewCheckpoint(original, source, signature)).toBe(true);
    for (const mutate of [s => { s.generation.engine.wasmSha256 = 'old'; }, s => { s.generation.accuracyVersion = 'old'; }, s => { delete s.records[2]; }, s => { s.records[1].provenance.color = 'b'; }, s => { s.positions[1].fen = original.initialFen; }, s => { s.records[1].loss = 90; }]) {
      const copy = structuredClone(source); mutate(copy); expect(validateReviewCheckpoint(original, copy, signature)).toBe(false);
    }
    expect(snapshotCompatible(signature, source, 'deeper')).toBe(false); expect(reviewIdentity(signature, 'quick')).not.toBe(reviewIdentity(signature, 'balanced')); h.session.dispose();
  });
  it('restores a partial review as paused and resumes from original history', async () => {
    const first = harness(), original = game(); first.session.setGame(original); await first.session.start(); const saved = structuredClone(first.session.getSnapshot()); first.session.dispose();
    saved.done = 2; saved.generation.coverage = { reviewed: 2, total: 4, unreviewed: 2, complete: false }; saved.generation.status = 'running';
    saved.records = { 1: saved.records[1], 2: saved.records[2] }; saved.positions = { 0: saved.positions[0], 1: saved.positions[1], 2: saved.positions[2] };
    const next = harness(); next.session.setGame(original); expect(await next.session.restore(saved)).toBe(true);
    expect(next.session.getSnapshot().generation.status).toBe('paused'); await next.session.resume();
    expect(next.analyze.mock.calls[0][0].position).toContain('moves e2e4 e7e5 g1f3'); expect(next.session.getSnapshot().done).toBe(4); next.session.dispose();
  });
  it('recovers complete final-move evidence even if closure preceded the final status write', async () => {
    const first = harness(), original = game(); first.session.setGame(original); await first.session.start();
    const saved = structuredClone(first.session.getSnapshot()); saved.generation.status = 'running'; saved.generation.completedAt = null;
    const next = harness(); next.session.setGame(original); expect(await next.session.restore(saved)).toBe(true);
    expect(next.session.getSnapshot().generation.status).toBe('completed'); expect(next.session.getSnapshot().generation.completedAt).toBeTruthy(); expect(next.createEngine).not.toHaveBeenCalled();
    first.session.dispose(); next.session.dispose();
  });
});

describe('exclusive coordinator', () => {
  it('does not allocate a worker until requested; reuses one worker across completed owners', async () => {
    const native = { ready: Promise.resolve(), analyze: vi.fn(async () => 'done'), dispose: vi.fn() }, factory = vi.fn(() => native);
    const coordinator = createEngineCoordinator({ createEngine: factory, locks: fakeLocks() });
    const first = coordinator.createClient('review'); expect(factory).not.toHaveBeenCalled(); await first.ready; expect(await first.analyze({})).toBe('done'); first.dispose(); await flush();
    const second = coordinator.createClient('position'); await second.ready; await second.analyze({}); expect(factory).toHaveBeenCalledTimes(1); second.dispose(); coordinator.dispose();
  });
  it('holds origin ownership between searches, denying a second coordinator', async () => {
    const locks = fakeLocks(), native = () => ({ ready: Promise.resolve(), analyze: vi.fn(), dispose: vi.fn() });
    const first = createEngineCoordinator({ locks, createEngine: native }), second = createEngineCoordinator({ locks, createEngine: native });
    const owner = first.createClient('review'); await owner.ready;
    await expect(second.createClient('review').ready).rejects.toThrow('Another Linea tab'); owner.dispose(); first.dispose(); second.dispose();
  });
  it('waits for native acknowledgement before preempting review with position analysis', async () => {
    const ack = deferred(); let signal;
    const native = { ready: Promise.resolve(), analyze: vi.fn(options => { signal = options.signal; return ack.promise; }), dispose: vi.fn() };
    const coordinator = createEngineCoordinator({ locks: fakeLocks(), createEngine: () => native });
    const preempt = vi.fn(), review = coordinator.createClient('review', preempt); await review.ready; const run = review.analyze({}); await flush();
    const position = coordinator.createClient('position'); let granted = false; const next = position.ready.then(() => { granted = true; }); await flush();
    expect(preempt).toHaveBeenCalledWith('position'); expect(signal.aborted).toBe(true); expect(granted).toBe(false);
    ack.resolve('stopped'); await run; await next; expect(granted).toBe(true); position.dispose(); review.dispose(); coordinator.dispose();
  });
  it('reacquires the same paused client without a stuck ownership ticket', async () => {
    const coordinator = createEngineCoordinator({ locks: fakeLocks(), createEngine: () => ({ ready: Promise.resolve(), analyze: vi.fn(), dispose: vi.fn() }) });
    const client = coordinator.createClient('review'); await client.ready; client.cancel(); await client.ready; expect(coordinator.getSnapshot().status).toBe('running'); client.dispose(); coordinator.dispose();
  });
  it('fails explicitly without safe cross-tab ownership support', async () => {
    const factory = vi.fn(); const coordinator = createEngineCoordinator({ locks: null, createEngine: factory });
    await expect(coordinator.createClient('review').ready).rejects.toThrow('Web Locks'); expect(factory).not.toHaveBeenCalled(); coordinator.dispose();
  });
  it('discards a failed engine startup so Retry can acquire a fresh native worker', async () => {
    let attempts = 0;
    const coordinator = createEngineCoordinator({ locks: fakeLocks(), createEngine: () => ({ ready: ++attempts === 1 ? Promise.reject(new Error('startup failed')) : Promise.resolve(), analyze: vi.fn(), dispose: vi.fn() }) });
    const first = coordinator.createClient('review'); await expect(first.ready).rejects.toThrow('startup failed'); first.dispose();
    const next = coordinator.createClient('review'); await next.ready; expect(attempts).toBe(2); next.dispose(); coordinator.dispose();
  });
});

describe('saved route and draft boundaries', () => {
  it('encodes opaque game keys, validates routes and preserves valid zero ply', () => {
    const url = workspaceUrl('chess.com:live:123/a', 0, 'report'), parsed = new URL(url, 'http://localhost');
    expect(readWorkspaceRoute(parsed)).toEqual({ kind: 'review', key: 'chess.com:live:123/a', ply: 0, view: 'report' });
    expect(readWorkspaceRoute(new URL('http://localhost/review/%ZZ')).kind).toBe('missing');
  });
  it('rebuilds legal branches but discards corrupt drafts without changing PGN', () => {
    const original = game(); const saved = safeWorkspaceDraft(original, { ply: 999, variation: { basePly: 0, moves: [{ uci: 'd2d4', after: 'invented' }] }, variationPly: 999 });
    expect(saved.ply).toBe(4); expect(saved.variation.moves[0].after).toContain('3P4'); expect(saved.variationPly).toBe(1);
    expect(safeWorkspaceDraft(original, { variation: { basePly: 0, moves: [{ uci: 'e2e5' }] } }).variation).toBeNull();
    expect(original.rawPgn).toBe('1. e4 e5 2. Nf3 Nc6 *');
  });
});
