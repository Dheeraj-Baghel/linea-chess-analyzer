import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { createVariationHandoff, createVariationReview, variationReviewKey } from '../../src/variationReview.js';
import { createReviewSession } from '../../src/reviewSession.js';
import { createEngineCoordinator } from '../../src/engineCoordinator.js';
import { gameFromFen, parseGame, positionChess, toUci, uciMove } from '../../src/chess.js';

// Scripted scores test isolation/control flow only. Browser coverage separately
// executes the native shipped Stockfish worker, without fabricated engine output.
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const response = (options, patch = {}) => ({ lines: [{ rank: 1, cp: 0, mate: null, depth: options.depth, pv: [options.searchMoves?.[0] || toUci(new Chess(options.fen).moves({ verbose: true })[0])], ...patch }] });
function branch(game, basePly, ucis) {
  const board = positionChess(game, basePly, null, 0);
  return { basePly, moves: ucis.map(uci => { const move = board.move(uciMove(uci)); return { ...move, uci: toUci(move), number: Number(move.before.split(' ')[5]) }; }) };
}
function harness({ controlled = false, respond = response } = {}) {
  const requests = [], engines = [];
  const createEngine = vi.fn(onPreempt => {
    const engine = { ready: Promise.resolve(), onPreempt, dispose: vi.fn(), analyze: vi.fn(options => {
      const gate = deferred(); requests.push({ options, ...gate });
      return controlled ? gate.promise : Promise.resolve(respond(options, requests.length - 1));
    }) };
    engines.push(engine); return engine;
  });
  return { requests, engines, createEngine, session: createVariationReview({ createEngine }) };
}
const study = () => parseGame('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *');
const target = (game, variation, ply = variation.moves.length, extra = {}) => ({ game, variation, ply, quality: 'balanced', ...extra });

describe('live branch move evidence', () => {
  it('reviews only the displayed alternate move, preserving the original game and checkpoint', async () => {
    const game = study(), variation = branch(game, 4, ['d2d4']);
    const mainline = { generation: { id: 'main' }, records: {}, done: 2 }, saved = JSON.stringify({ game, mainline });
    const h = harness(); await h.session.setTarget(target(game, variation, 1, { mainline }));
    const state = h.session.getSnapshot();
    expect(state.status).toBe('complete'); expect(state.record).toMatchObject({ provisional: false, provenance: { scope: 'variation', branchBasePly: 4, branchPly: 1, ply: 5, uci: 'd2d4' } });
    expect(state.record.provenance.generationId).not.toBe('main');
    expect(h.requests).toHaveLength(2);
    expect(h.requests[0].options.position).toContain('moves e2e4 e7e5 g1f3 b8c6');
    expect(h.requests[1].options.position).toContain('moves e2e4 e7e5 g1f3 b8c6 d2d4');
    expect(h.requests.every(({ options }) => options.fresh && options.ms === 1100 && !options.position.includes('f1b5'))).toBe(true);
    expect(JSON.stringify({ game, mainline })).toBe(saved); expect(h.engines[0].dispose).toHaveBeenCalled(); h.session.dispose();
  });
  it('reuses completed prefix results on back/forward, but not a rewritten sibling move', async () => {
    const game = study(), first = branch(game, 0, ['d2d4', 'd7d5']), h = harness();
    await h.session.setTarget(target(game, first, 1)); const one = h.session.getSnapshot().record;
    await h.session.setTarget(target(game, first)); const count = h.requests.length;
    await h.session.setTarget(target(game, first, 1)); expect(h.session.getSnapshot().record).toBe(one); expect(h.requests).toHaveLength(count);
    const rewritten = branch(game, 0, ['d2d4', 'g8f6']); await h.session.setTarget(target(game, rewritten));
    expect(h.session.getSnapshot().record.provenance.uci).toBe('g8f6'); expect(h.session.getSnapshot().records[1]).toBe(one);
    expect(h.session.getSnapshot().records[2].provenance.uci).not.toBe('d7d5'); h.session.dispose();
  });
  it('a starting point has no alternate move badge and does not acquire an engine', async () => {
    const game = study(), variation = branch(game, 2, ['d2d4']), h = harness();
    await h.session.setTarget(target(game, variation, 0)); expect(h.session.getSnapshot()).toMatchObject({ status: 'idle', record: null });
    expect(h.createEngine).not.toHaveBeenCalled(); h.session.dispose();
  });
  it('changing game identity or quality invalidates cached branch evidence', async () => {
    const game = study(), variation = branch(game, 0, ['d2d4']), h = harness();
    await h.session.setTarget(target(game, variation)); const first = h.session.getSnapshot().record;
    await h.session.setTarget(target(game, variation, 1, { quality: 'quick' }));
    expect(h.session.getSnapshot().record.provenance.policy.id).toBe('quick'); expect(h.requests.at(-1).options.ms).toBe(450);
    await h.session.setTarget(target({ ...game, id: 'new-import' }, variation));
    expect(h.session.getSnapshot().record).not.toBe(first); expect(h.session.getSnapshot().record.provenance.gameId).toBe('new-import'); h.session.dispose();
  });
  it('retains complete castling/en-passant/repetition history rather than reviewing a FEN alone', async () => {
    const game = parseGame('1. Nf3 Nf6 2. Ng1 Ng8 *'), variation = branch(game, 4, ['g1f3', 'g8f6', 'f3g1', 'f6g8']), h = harness();
    await h.session.setTarget(target(game, variation));
    const record = h.session.getSnapshot().record;
    expect(record.after.claims.threefold).toBe(true); expect(record.after.exact).toBe(false);
    expect(h.requests.at(-1).options.position).toContain('moves g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8');
    expect(variationReviewKey(game, variation, 4, 'balanced')).not.toBe(variationReviewKey(game, branch(game, 0, ['g1f3', 'g8f6', 'f3g1', 'f6g8']), 4, 'balanced')); h.session.dispose();
  });
  it('uses the same classification and sacrifice pipeline as the original-game reviewer', async () => {
    const game = parseGame('[SetUp "1"]\n[FEN "8/8/8/8/8/2R3p1/2pk2P1/7K w - - 0 1"]\n\n1. Rxc2+ *');
    const respond = options => response(options, { pv: options.position.endsWith('d2c2') ? ['h1g1'] : options.position.endsWith('c3c2') ? ['d2c2'] : ['c3c2'] });
    const h = harness({ respond }); await h.session.setTarget(target(game, branch(game, 0, ['c3c2'])));
    const main = createReviewSession({ createEngine: () => ({ ready: Promise.resolve(), analyze: async options => respond(options), cancel() {}, dispose() {} }) });
    main.setGame(game); await main.start();
    const record = h.session.getSnapshot().record, original = main.getSnapshot().records[1];
    expect(record.type).toBe('brilliant'); expect(record.sacrificeCheck.status).toBe('verified');
    expect([record.type, record.loss, record.accuracy, record.provisional]).toEqual([original.type, original.loss, original.accuracy, original.provisional]);
    expect(h.requests.map(({ options }) => options.ms)).toEqual([1100, 1100, 1400]); h.session.dispose(); main.dispose();
  });
  it('does not turn shallow sacrifice evidence into Brilliant', async () => {
    const game = gameFromFen('8/8/8/8/8/2R3p1/2pk2P1/7K w - - 0 1');
    const h = harness({ respond: options => response(options, { depth: 7, pv: options.position.includes(' moves ') ? ['d2c2'] : ['c3c2'] }) });
    await h.session.setTarget(target(game, branch(game, 0, ['c3c2'])));
    expect(h.session.getSnapshot().record).toMatchObject({ provisional: true }); expect(h.session.getSnapshot().record.type).not.toBe('brilliant'); h.session.dispose();
  });
  it('black-to-move mate uses exact terminal evidence and actual mover color', async () => {
    const game = gameFromFen('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 34');
    const h = harness({ respond: options => response(options, { cp: -100000, mate: -1, pv: ['d8h4'] }) });
    await h.session.setTarget(target(game, branch(game, 0, ['d8h4'])));
    expect(h.session.getSnapshot().record).toMatchObject({ type: 'best', after: { exact: true, reason: 'checkmate' }, provenance: { color: 'b', san: 'Qh4#' } });
    expect(h.requests).toHaveLength(1); h.session.dispose();
  });
  it('promotion choices cannot alias each other in the review cache', async () => {
    const game = gameFromFen('7k/P7/8/8/8/8/8/6K1 w - - 0 1'), h = harness();
    const knight = branch(game, 0, ['a7a8n']), queen = branch(game, 0, ['a7a8q']);
    await h.session.setTarget(target(game, knight)); expect(h.session.getSnapshot().record.after.reason).toBe('insufficient-material');
    await h.session.setTarget(target(game, queen)); expect(h.session.getSnapshot().record.provenance.uci).toBe('a7a8q');
    expect(h.session.getSnapshot().record.after.exact).toBe(false); h.session.dispose();
  });
});

describe('cancellation and safe recovery', () => {
  it('rapid replacement rejects a late score and immediately clears the old move badge', async () => {
    const game = study(), h = harness({ controlled: true });
    const old = h.session.setTarget(target(game, branch(game, 0, ['d2d4']))); await flush();
    const next = h.session.setTarget(target(game, branch(game, 0, ['c2c4']))); await flush();
    expect(h.requests[0].options.signal.aborted).toBe(true); expect(h.session.getSnapshot().record).toBeNull();
    h.requests[0].resolve(response(h.requests[0].options, { cp: 9999 })); await old;
    expect(h.session.getSnapshot().status).toBe('thinking');
    h.requests[1].resolve(response(h.requests[1].options)); await flush();
    h.requests[2].resolve(response(h.requests[2].options)); await next;
    expect(h.session.getSnapshot().record.provenance.uci).toBe('c2c4'); expect(h.session.getSnapshot().record.before.cp).toBe(0); h.session.dispose();
  });
  it('returning to game cancels the branch and ignores late errors', async () => {
    const game = study(), h = harness({ controlled: true });
    const run = h.session.setTarget(target(game, branch(game, 0, ['d2d4']))); await flush();
    h.session.clear(); h.requests[0].reject(new Error('late branch failure')); await run;
    expect(h.session.getSnapshot()).toMatchObject({ key: null, record: null, status: 'idle', error: '' }); h.session.dispose();
  });
  it('bad engine output shows unavailable, then Retry uses new evidence without a fake label', async () => {
    let fail = true;
    const game = study(), h = harness({ respond: options => fail ? { lines: [] } : response(options) });
    await h.session.setTarget(target(game, branch(game, 0, ['d2d4'])));
    expect(h.session.getSnapshot()).toMatchObject({ status: 'error', record: null }); expect(h.session.getSnapshot().error).toMatch(/scored review depth/);
    fail = false; await h.session.retry(); expect(h.session.getSnapshot()).toMatchObject({ status: 'complete', error: '' }); h.session.dispose();
  });
  it('preemption pauses once without automatically fighting position ownership', async () => {
    const game = study(), h = harness({ controlled: true });
    const run = h.session.setTarget(target(game, branch(game, 0, ['d2d4']))); await flush();
    h.engines[0].onPreempt('position'); expect(h.session.getSnapshot().status).toBe('paused'); expect(h.requests[0].options.signal.aborted).toBe(true);
    h.requests[0].resolve(response(h.requests[0].options)); await run;
    expect(h.createEngine).toHaveBeenCalledTimes(1); expect(h.session.getSnapshot().record).toBeNull(); h.session.dispose();
  });
  it('disposal rejects all late results and notifications', async () => {
    const game = study(), h = harness({ controlled: true }), listener = vi.fn(); h.session.subscribe(listener);
    const run = h.session.setTarget(target(game, branch(game, 0, ['d2d4']))); await flush();
    h.session.dispose(); const count = listener.mock.calls.length;
    h.requests[0].resolve(response(h.requests[0].options)); await run;
    expect(listener).toHaveBeenCalledTimes(count);
  });
});

describe('original-review handoff', () => {
  function owner(patch = {}) {
    let state = { gameId: 'game', running: true, done: 2, total: 10, selectedQuality: 'balanced', generation: { id: 'generation', policy: { id: 'balanced' } }, ...patch };
    const review = { getSnapshot: () => state, stop: vi.fn(() => { state = { ...state, running: false }; }), resume: vi.fn(() => { state = { ...state, running: true }; }) };
    return { review, handoff: createVariationHandoff(review), change: patch => { state = { ...state, ...patch }; } };
  }
  it('pauses and resumes the same unfinished generation exactly once', () => {
    const { review, handoff } = owner(); handoff.enter('game'); handoff.enter('game'); expect(review.stop).toHaveBeenCalledTimes(1);
    handoff.leave('game'); handoff.leave('game'); expect(review.resume).toHaveBeenCalledTimes(1);
  });
  for (const [name, patch] of [['manually paused', { running: false }], ['completed', { running: false, done: 10 }], ['never started', { running: false, generation: null }]]) it(`does not start a ${name} review`, () => {
    const { review, handoff } = owner(patch); handoff.enter('game'); handoff.leave('game'); expect(review.resume).not.toHaveBeenCalled();
  });
  for (const [name, patch] of [['new game', { gameId: 'replacement' }], ['new generation', { generation: { id: 'other', policy: { id: 'balanced' } } }], ['pending quality', { selectedQuality: 'deeper' }]]) it(`does not resume after ${name}`, () => {
    const { review, handoff, change } = owner(); handoff.enter('game'); change(patch); handoff.leave('game'); expect(review.resume).not.toHaveBeenCalled();
  });
  it('navigation away or hiding the tab abandons automatic resume', () => {
    const { review, handoff } = owner(); handoff.enter('game'); handoff.abandon(); handoff.leave('game'); expect(review.resume).not.toHaveBeenCalled();
  });
  it('captures an import auto-review that starts after branch entry without losing resume intent', () => {
    const { review, handoff, change } = owner({ running: false, generation: null });
    handoff.enter('game'); change({ running: true, generation: { id: 'late-generation', policy: { id: 'balanced' } } });
    handoff.enter('game'); expect(review.stop).toHaveBeenCalledTimes(1);
    handoff.leave('game'); expect(review.resume).toHaveBeenCalledTimes(1);
  });
  it('variation priority waits for native stop acknowledgment and reuses the one worker', async () => {
    let busy = false, signal;
    const locks = { request: async (_, options, callback) => { if (busy) return callback(null); busy = true; try { return await callback({}); } finally { busy = false; } } };
    const ack = deferred(), createEngine = vi.fn(() => ({ ready: Promise.resolve(), analyze: options => { signal = options.signal; return ack.promise; }, dispose() {} }));
    const coordinator = createEngineCoordinator({ locks, createEngine });
    const preempt = vi.fn(), main = coordinator.createClient('review', preempt); await main.ready;
    const running = main.analyze({}); await flush();
    const variation = coordinator.createClient('variation'); let granted = false; const ready = variation.ready.then(() => { granted = true; }); await flush();
    expect(preempt).toHaveBeenCalledWith('variation'); expect(signal.aborted).toBe(true); expect(granted).toBe(false);
    ack.resolve('stopped'); await running; await ready;
    expect(granted).toBe(true); expect(createEngine).toHaveBeenCalledTimes(1);
    variation.dispose(); main.dispose(); coordinator.dispose();
  });
});
