import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { createHash } from 'node:crypto';
import { parseGame, gameFromFen, toUci } from '../../src/chess.js';
import { createReviewSession } from '../../src/reviewSession.js';
import { ENGINE_BUILD } from '../../src/engineBuild.js';
import { REVIEW_POLICIES, evaluationDepthLabel, reviewGamePayload, reviewGameSignature, reviewTerminalEvaluation, ruleDrawClaims } from '../../src/reviewPolicy.js';
import { reviewCategoryCounts, reviewDepthSummary, accuracySummary } from '../../src/review.js';

// Deterministic controller tests only. Native browser tests independently verify
// the real WASM policies, identities and sacrifice evidence; these are not scores.
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const line = (options, extra = {}) => ({ lines: [{ rank: 1, depth: options.depth, cp: 0, mate: null, pv: [toUci(new Chess(options.fen).moves({ verbose: true })[0])], ...extra }] });
function harness({ controlled = false, respond = line, signature } = {}) {
  const engines = [];
  const createEngine = vi.fn(() => {
    const engine = { ready: Promise.resolve(), closed: false, fatal: null, requests: [], dispose: vi.fn(() => { engine.closed = true; }) };
    engine.analyze = vi.fn(options => {
      const gate = deferred(); engine.requests.push({ options, ...gate });
      return controlled ? gate.promise : Promise.resolve(respond(options, engine.requests.length - 1));
    });
    engines.push(engine); return engine;
  });
  let serial = 0;
  const session = createReviewSession({ createEngine, signature: signature || (async payload => createHash('sha256').update(payload).digest('hex')), id: () => `generation-${++serial}`, timestamp: () => '2026-10-20T04:00:00.000Z', elapsedTime: () => 100 });
  return { session, engines, createEngine };
}
const normal = () => parseGame('[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 2. Nf3 *');
const sacrifice = () => parseGame('[SetUp "1"]\n[FEN "8/8/8/8/8/2R3p1/2pk2P1/7K w - - 0 1"]\n\n1. Rxc2+ *');


describe('F03 independent policy and content identity', () => {
  it('retains Balanced and explicitly bounds quicker/deeper policies', () => {
    expect(REVIEW_POLICIES.balanced).toMatchObject({ targetDepth: 16, positionMs: 1100, sacrificeMs: 1400 });
    expect(REVIEW_POLICIES.quick).toMatchObject({ targetDepth: 12, positionMs: 450, sacrificeMs: 600 });
    expect(REVIEW_POLICIES.deeper).toMatchObject({ targetDepth: 20, positionMs: 3000, sacrificeMs: 4000 });
  });
  it('SHA-256 matches the original content but excludes session identity', async () => {
    const game = normal(), payload = reviewGamePayload(game);
    expect(await reviewGameSignature(payload)).toBe(createHash('sha256').update(payload).digest('hex'));
    expect(await reviewGameSignature(reviewGamePayload({ ...game, id: 'another-session' }))).toBe(await reviewGameSignature(payload));
    expect(await reviewGameSignature(reviewGamePayload({ ...game, rawPgn: game.rawPgn + ' {clock note}' }))).not.toBe(await reviewGameSignature(payload));
  });
  it('pending quality never creates a generation, worker or job by itself', () => {
    const { session, createEngine } = harness(); session.setGame(normal()); session.setQuality('deeper');
    expect(session.getSnapshot()).toMatchObject({ selectedQuality: 'deeper', generation: null, records: {}, running: false });
    expect(createEngine).not.toHaveBeenCalled(); expect(() => session.setQuality('threads')).toThrow(/Unknown/); session.dispose();
  });
  for (const quality of Object.keys(REVIEW_POLICIES)) it(`sends ${quality} policy to actual job options and stamps every record`, async () => {
    const { session, engines } = harness({ respond: options => line(options, { depth: 8 }) });
    const game = normal(), unchanged = JSON.stringify(game); session.setGame(game); session.setQuality(quality); await session.start();
    const state = session.getSnapshot(), policy = REVIEW_POLICIES[quality];
    expect(state.generation).toMatchObject({ policy, status: 'completed', engine: ENGINE_BUILD, game: { id: game.id, signature: createHash('sha256').update(reviewGamePayload(game)).digest('hex') } });
    expect(engines[0].requests).toHaveLength(4);
    for (const { options } of engines[0].requests) expect(options).toMatchObject({ depth: policy.targetDepth, ms: policy.positionMs, multiPv: 1 });
    for (const record of Object.values(state.records)) {
      expect(record.provenance).toMatchObject({ generationId: state.generation.id, gameId: game.id, policy, engine: ENGINE_BUILD });
      expect(record.before.depth).toBe(8); expect(record.after.depth).toBe(8);
      expect(record.type).not.toBe('brilliant');
    }
    expect(reviewDepthSummary(state).positions).toEqual({ searches: 4, rules: 0, min: 8, max: 8, belowTarget: 4 });
    expect(JSON.stringify(game)).toBe(unchanged); session.dispose();
  });
  it('keeps completed results/provenance unchanged when another quality is pending', async () => {
    const { session, engines } = harness(); session.setGame(normal()); await session.start();
    const original = session.getSnapshot(), saved = JSON.stringify(original.records); session.setQuality('deeper');
    expect(session.getSnapshot().generation).toBe(original.generation); expect(JSON.stringify(session.getSnapshot().records)).toBe(saved);
    expect(session.getSnapshot().generation.policy.id).toBe('balanced'); expect(engines).toHaveLength(1);
    expect(Object.isFrozen(original.generation.policy)).toBe(true); session.dispose();
  });
  it('an explicit rerun gets a new generation/worker and does not mix previous policy records', async () => {
    const { session, engines } = harness(); session.setGame(normal()); await session.start();
    const first = session.getSnapshot(); session.setQuality('quick'); await session.rerun(); const next = session.getSnapshot();
    expect(next.generation.id).not.toBe(first.generation.id); expect(next.generation.game.signature).toBe(first.generation.game.signature);
    expect(engines).toHaveLength(2); expect(engines[0].dispose).toHaveBeenCalled();
    expect(Object.values(next.records).every(record => record.provenance.generationId === next.generation.id && record.provenance.policy.id === 'quick')).toBe(true);
    expect(Object.values(first.records).every(record => record.provenance.policy.id === 'balanced')).toBe(true); session.dispose();
  });
  it('explicit rerun of the same policy still creates a fresh review generation', async () => {
    const { session } = harness(); session.setGame(normal()); await session.start(); const first = session.getSnapshot().generation.id;
    await session.start(); expect(session.getSnapshot().generation.id).toBe(first);
    await session.rerun(); expect(session.getSnapshot().generation.id).not.toBe(first); session.dispose();
  });
});

describe('F03 generation and attempt cancellation', () => {
  it('changing pending quality during a running review neither aborts it nor changes its job budgets', async () => {
    const { session, engines } = harness({ controlled: true }); const game = parseGame('1. e4 *'); session.setGame(game);
    const run = session.start(); await flush(); const generation = session.getSnapshot().generation.id;
    session.setQuality('deeper'); session.setGame(game);
    expect(engines[0].requests[0].options.signal.aborted).toBe(false); expect(engines).toHaveLength(1);
    engines[0].requests[0].resolve(line(engines[0].requests[0].options)); await flush();
    expect(engines[0].requests[1].options).toMatchObject({ depth: 16, ms: 1100 });
    engines[0].requests[1].resolve(line(engines[0].requests[1].options)); await run;
    expect(session.getSnapshot()).toMatchObject({ selectedQuality: 'deeper', generation: { id: generation, policy: { id: 'balanced' }, coverage: { reviewed: 1, total: 1, complete: true } } });
    session.dispose();
  });
  it('pause/resume keeps completed evidence and rejects a late same-generation search', async () => {
    const { session, engines } = harness({ controlled: true }); session.setGame(parseGame('1. e4 e5 *'));
    const first = session.start(); await flush(); const engine = engines[0];
    engine.requests[0].resolve(line(engine.requests[0].options)); await flush();
    engine.requests[1].resolve(line(engine.requests[1].options)); await flush();
    expect(session.getSnapshot().done).toBe(1); const generation = session.getSnapshot().generation.id, saved = session.getSnapshot().records[1];
    session.stop(); expect(engine.requests[2].options.signal.aborted).toBe(true); expect(session.canResume()).toBe(true);
    const resumed = session.resume(); await flush(); expect(engine.requests).toHaveLength(4);
    engine.requests[2].resolve(line(engine.requests[2].options, { cp: 900, depth: 99 })); await first;
    expect(session.getSnapshot().running).toBe(true); expect(session.getSnapshot().done).toBe(1);
    engine.requests[3].resolve(line(engine.requests[3].options)); await resumed;
    const state = session.getSnapshot(); expect(state.generation.id).toBe(generation); expect(state.generation.resumeCount).toBe(1);
    expect(state.records[1]).toBe(saved); expect(state.done).toBe(2); expect(state.records[2].after.depth).toBe(16); expect(state.positions[2].cp).toBe(0);
    expect(engines).toHaveLength(1); session.dispose();
  });
  it('pending-policy mismatch prevents resume and explicit start starts a new generation', async () => {
    const { session, engines } = harness({ controlled: true }); session.setGame(parseGame('1. e4 *'));
    const first = session.start(); await flush(); const old = session.getSnapshot().generation.id;
    session.stop(); session.setQuality('deeper'); await session.resume(); expect(engines).toHaveLength(1);
    const next = session.start(); await flush(); expect(session.getSnapshot().generation.id).not.toBe(old); expect(engines).toHaveLength(2);
    engines[0].requests[0].reject(new Error('late old failure')); await first;
    expect(session.getSnapshot().error).toBe(''); expect(engines[1].closed).toBe(false);
    engines[1].requests[0].resolve(line(engines[1].requests[0].options)); await flush();
    engines[1].requests[1].resolve(line(engines[1].requests[1].options)); await next;
    expect(session.getSnapshot().generation.policy.id).toBe('deeper'); session.dispose();
  });
  it('rerun while running aborts old work and its late error cannot dispose the new worker', async () => {
    const { session, engines } = harness({ controlled: true }); session.setGame(parseGame('1. d4 *'));
    const first = session.start(); await flush(); const old = session.getSnapshot().generation.id;
    const rerun = session.rerun(); await flush();
    expect(engines[0].requests[0].options.signal.aborted).toBe(true); expect(session.getSnapshot().generation.id).not.toBe(old);
    engines[0].requests[0].reject(new Error('obsolete')); await first;
    expect(session.getSnapshot().running).toBe(true); expect(session.getSnapshot().error).toBe(''); expect(engines[1].dispose).not.toHaveBeenCalled();
    engines[1].requests[0].resolve(line(engines[1].requests[0].options)); await flush(); engines[1].requests[1].resolve(line(engines[1].requests[1].options)); await rerun; session.dispose();
  });
  it('replacing a game clears its generation immediately and rejects old results', async () => {
    const { session, engines } = harness({ controlled: true }); session.setGame(normal()); const run = session.start(); await flush();
    const next = parseGame('1. d4 *'); session.setGame(next); engines[0].requests[0].resolve(line(engines[0].requests[0].options)); await run;
    expect(session.getSnapshot()).toMatchObject({ gameId: next.id, generation: null, records: {}, positions: {}, done: 0, running: false }); session.dispose();
  });
  it('detects changed content even if a caller reused the same game session id', async () => {
    const { session } = harness(); const first = normal(); session.setGame(first); await session.start();
    session.setGame({ ...parseGame('1. d4 *'), id: first.id }); expect(session.getSnapshot().generation).toBeNull(); expect(session.getSnapshot().records).toEqual({}); session.dispose();
  });
  it('rejects late fingerprints and rapid duplicate starts before creating jobs', async () => {
    const firstHash = deferred(), secondHash = deferred(); let count = 0;
    const { session, createEngine } = harness({ signature: () => (++count === 1 ? firstHash : secondHash).promise });
    session.setGame(normal()); const first = session.start(); await session.start(); expect(count).toBe(1); expect(createEngine).not.toHaveBeenCalled();
    const next = parseGame('1. d4 *'); session.setGame(next); const second = session.start();
    firstHash.resolve('a'.repeat(64)); await first; expect(createEngine).not.toHaveBeenCalled();
    secondHash.resolve('b'.repeat(64)); await second; expect(createEngine).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().generation.game.signature).toBe('b'.repeat(64)); session.dispose();
  });
  it('invalid search evidence produces an explicit error, then resume preserves the generation', async () => {
    let fail = true;
    const { session, engines } = harness({ respond: options => fail ? { lines: [{ cp: 0, pv: [], depth: undefined }] } : line(options) });
    session.setGame(normal()); await session.start(); const generation = session.getSnapshot().generation.id;
    expect(session.getSnapshot()).toMatchObject({ done: 0, running: false }); expect(session.getSnapshot().error).toMatch(/scored review depth/); expect(engines[0].closed).toBe(true);
    fail = false; await session.resume(); expect(session.getSnapshot().generation.id).toBe(generation); expect(session.getSnapshot().done).toBe(3); expect(session.getSnapshot().error).toBe(''); session.dispose();
  });
  it('disposal prevents all late async updates', async () => {
    const { session, engines } = harness({ controlled: true }); const listener = vi.fn(); session.subscribe(listener);
    session.setGame(normal()); const run = session.start(); await flush(); session.dispose(); const count = listener.mock.calls.length;
    engines[0].requests[0].resolve(line(engines[0].requests[0].options)); await run; expect(listener).toHaveBeenCalledTimes(count);
  });
  it('resolves a conflicting PV using equal-limit same-root single-PV searches', async () => {
    const { session, engines } = harness({ respond: (options, index) => line(options, { cp: index === 1 ? -500 : index === 0 ? 500 : 0, pv: ['e2e4'] }) });
    session.setGame(parseGame('1. e4 *')); await session.start();
    const state = session.getSnapshot(), check = state.rechecks[1];
    expect(check.initialLoss).toBeGreaterThan(70); expect(check.refinedLoss).toBe(0); expect(check.status).toBe('verified');
    expect(state.records[1].accuracy).toBe(100);
    const searches = engines[0].requests.slice(2, 4).map(request => request.options);
    expect(searches[0]).toMatchObject({ depth: 18, ms: 2200, multiPv: 1, searchMoves: [] });
    expect(searches[1]).toMatchObject({ depth: 18, ms: 2200, multiPv: 1, searchMoves: ['e2e4'] });
    expect(searches[0].position).toBe(searches[1].position); session.dispose();
  });
  it('retains unresolved same-best loss as provisional, not a perfect Best label', async () => {
    const { session } = harness({ respond: (options, index) => line(options, { cp: index === 1 || options.searchMoves?.length ? -500 : 500, pv: ['e2e4'] }) });
    session.setGame(parseGame('1. e4 *')); await session.start();
    const record = session.getSnapshot().records[1];
    expect(record.provisional).toBe(true); expect(record.type).toBe('blunder'); expect(record.accuracy).toBeLessThan(3); session.dispose();
  });
  it('pause during a root recheck rejects its late result and resumes original history', async () => {
    const { session, engines } = harness({ controlled: true }); session.setGame(parseGame('1. e4 *'));
    const first = session.start(); await flush(); const engine = engines[0];
    engine.requests[0].resolve(line(engine.requests[0].options, { cp: 500, pv: ['e2e4'] })); await flush();
    engine.requests[1].resolve(line(engine.requests[1].options, { cp: -500 })); await flush();
    expect(engine.requests).toHaveLength(3); session.stop(); const resumed = session.resume(); await flush();
    engine.requests[2].resolve(line(engine.requests[2].options, { cp: 900 })); await first;
    expect(session.getSnapshot().rechecks).toEqual({});
    for (let index = 3; index <= 5; index++) { engine.requests[index].resolve(line(engine.requests[index].options, { cp: 0, pv: ['e2e4'] })); await flush(); }
    await resumed; expect(session.getSnapshot().done).toBe(1); expect(session.getSnapshot().rechecks[1].best.cp).toBe(0); session.dispose();
  });
});

describe('F03 sacrifice/rules provenance and F04 totals', () => {
  it('uses separate policy budgets and actual depths for every sacrifice stage', async () => {
    const { session, engines } = harness({ respond: (options, index) => line(options, { pv: [[ 'c3c2' ], [ 'd2c2' ], [ 'h1g1' ]][index], depth: 16 }) });
    session.setGame(sacrifice()); await session.start(); const record = session.getSnapshot().records[1];
    expect(engines[0].requests.map(request => request.options.ms)).toEqual([1100, 1100, 1400]);
    expect(record.type).toBe('brilliant'); expect(record.sacrificeCheck.status).toBe('verified'); expect(record.sacrificeCheck.evaluation.depth).toBe(16);
    expect(record.provenance.policy.sacrificeMs).toBe(1400); session.dispose();
  });
  it('a shallow acceptance is retained as evidence but cannot be called verified Brilliant', async () => {
    const { session } = harness({ respond: (options, index) => line(options, { pv: [[ 'c3c2' ], [ 'd2c2' ], [ 'h1g1' ]][index], depth: index === 2 ? 7 : 16 }) });
    session.setGame(sacrifice()); await session.start(); const record = session.getSnapshot().records[1];
    expect(record.type).not.toBe('brilliant'); expect(record.brilliance.verified).toBe(false); expect(record.sacrificeCheck.evaluation.depth).toBe(7); expect(record.sacrificeCheck.status).toBe('not-verified'); session.dispose();
  });
  it('exact accepting outcomes have zero native search depth and are not counted as searches', async () => {
    const { session, engines } = harness({ respond: (options, index) => line(options, { pv: index === 0 ? ['c3c2'] : ['d2c2'] }) });
    session.setGame(parseGame('[SetUp "1"]\n[FEN "8/8/8/8/8/2R5/2pk4/7K w - - 0 1"]\n\n1. Rxc2+ *')); await session.start(); const state = session.getSnapshot();
    expect(engines[0].requests).toHaveLength(2); expect(state.acceptances[1]).toMatchObject({ depth: 0, exact: true, source: 'rules', reason: 'insufficient-material', targetDepth: null, budgetMs: null });
    expect(reviewDepthSummary(state).acceptances).toEqual({ searches: 0, rules: 1, min: null, max: null, belowTarget: 0 }); expect(state.records[1].type).toBe('brilliant'); session.dispose();
  });
  it('records a Black-start mating move under Black and an exact terminal after-position', async () => {
    const { session } = harness({ respond: options => line(options, { pv: ['d8h4'] }) });
    const game = parseGame('[SetUp "1"]\n[FEN "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 34"]\n[Result "0-1"]\n\n34... Qh4# 0-1');
    session.setGame(game); await session.start(); const state = session.getSnapshot();
    expect(state.records[1].provenance.color).toBe('b'); expect(state.records[1].after).toMatchObject({ depth: 0, exact: true, reason: 'checkmate' });
    const counts = reviewCategoryCounts(game, state.records, state.generation.id);
    expect(counts.w).toEqual({ total: 0, reviewed: 0, unreviewed: 0 }); expect(counts.b).toEqual({ total: 1, reviewed: 1, unreviewed: 0 }); expect(counts.categories.best.b).toBe(1); session.dispose();
  });
  it('never creates a game review for a FEN-only position', async () => {
    const { session, createEngine } = harness(); session.setGame(gameFromFen(new Chess().fen())); await session.start(); await session.rerun();
    expect(createEngine).not.toHaveBeenCalled(); expect(session.getSnapshot().generation).toBeNull(); session.dispose();
  });
  it('keeps exact rule results separate from claimable draws and search targets', () => {
    const chess = new Chess(); chess.loadPgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *');
    expect(reviewTerminalEvaluation(chess)).toBeNull();
    expect(ruleDrawClaims(chess)).toMatchObject({ threefold: true });
    expect(evaluationDepthLabel({ source: 'engine', depth: 9, targetDepth: 20 })).toBe('Reached depth 9 / target 20');
  });
  it('category and per-color totals equal reviewed original plies, excluding stale and extra entries', () => {
    const game = normal(); const records = { 1: { type: 'brilliant', loss: 0, provenance: { generationId: 'new' } }, 2: { type: 'blunder', loss: 30, provenance: { generationId: 'old' } }, 999: { type: 'best', provenance: { generationId: 'new' } } };
    const totals = reviewCategoryCounts(game, records, 'new'); expect(totals.reviewed).toBe(1); expect(totals.unreviewed).toBe(2); expect(totals.categories.brilliant.w).toBe(1);
    expect(totals.w).toEqual({ total: 2, reviewed: 1, unreviewed: 1 }); expect(totals.b).toEqual({ total: 1, reviewed: 0, unreviewed: 1 });
    expect(Object.values(totals.categories).reduce((sum, row) => sum + row.w + row.b, 0)).toBe(totals.reviewed);
    expect(accuracySummary(game, { 1: records[1] }).complete).toBe(false);
  });
});
