import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { createBatchReview } from '../../src/batchReview.js';
import { buildPlayerReport, reportPhase } from '../../src/playerReport.js';
import { reviewGamePayload, reviewGameSignature } from '../../src/reviewPolicy.js';

const pgn = '[White "Alice"]\n[Black "Bob"]\n[WhiteElo "1500"]\n[BlackElo "1600"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
const sample = () => ({ provider: 'chesscom', username: 'alice', filter: 'all', fetchedAt: '2026-10-20T00:00:00Z', games: [0, 1].map((n) => ({ key: `chess.com:live:${n + 1}`, provider: 'chess.com', id: String(n + 1), url: `https://www.chess.com/game/live/${n + 1}`, pgn: n ? pgn.replace('[White "Alice"]', '[White "Bob"]').replace('[Black "Bob"]', '[Black "Alice"]') : pgn, color: n ? 'b' : 'w', format: n ? 'rapid' : 'blitz', date: `2026-10-${20 - n}T00:00:00Z` })) });
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
async function waitFor(condition) { for (let i = 0; i < 150; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 2)); } throw new Error('Controller did not reach the expected state.'); }
function harness({ failFirst = false, holdThird = false } = {}) {
  const stores = Object.fromEntries(['games', 'batches', 'reports', 'reviews'].map(name => [name, new Map()]));
  let calls = 0, held = false, failed = false;
  const analyze = vi.fn(async options => {
    calls++;
    if (failFirst && !failed) { failed = true; throw new Error('Injected review failure'); }
    if (holdThird && calls === 3) { held = true; await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Paused', 'AbortError')), { once: true })); }
    const move = new Chess(options.fen).moves({ verbose: true })[0];
    return { lines: [{ rank: 1, cp: 0, mate: null, depth: options.depth, pv: [options.searchMoves?.[0] || move.from + move.to + (move.promotion || '')] }] };
  });
  const coordinator = { createClient: vi.fn(() => ({ ready: Promise.resolve(), analyze, closed: false, cancel: vi.fn(), dispose: vi.fn() })) };
  const library = {
    async put(name, row) { stores[name].set(row.key, structuredClone(row)); },
    async read(name, key) { return structuredClone(stores[name].get(key) || null); },
    async all(name) { return structuredClone([...stores[name].values()]); },
    async saveGame(game) { const signature = await reviewGameSignature(reviewGamePayload(game)); const key = `chess.com:live:${game.source.id}`; const record = { key, signature }; stores.games.set(key, record); return record; },
    async saveCheckpoint(key, signature, snapshot) { stores.reviews.set(`${key}:${snapshot.generation.policy.id}`, { signature, snapshot: structuredClone(snapshot) }); return true; },
    async getReview(key, signature, quality) { const row = stores.reviews.get(`${key}:${quality}`); return row?.signature === signature ? structuredClone(row) : null; },
  };
  let serial = 0;
  const batch = createBatchReview({ library, coordinator, id: () => `batch-${++serial}` });
  return { batch, library, stores, coordinator, analyze, isHeld: () => held };
}

describe('sequential frozen batch ownership (mock transport only)', () => {
  it('freezes up to ten sources, processes sequentially and saves each completed game', async () => {
    const h = harness(), input = sample(); await h.batch.start(input); input.games[0].pgn = 'mutated'; input.filter = 'bullet';
    await waitFor(() => h.batch.getSnapshot().manifest.status === 'completed');
    const state = h.batch.getSnapshot(); expect(state.report.completed).toBe(2); expect(state.report.selected).toBe(2); expect(state.manifest.filter).toBe('all'); expect(state.manifest.selectedGames[0].pgn).toBe(pgn);
    expect(h.stores.reviews.size).toBe(2); expect(h.stores.reports.get('batch-1').value.completed).toBe(2); expect(h.coordinator.createClient).toHaveBeenCalledTimes(2); h.batch.dispose();
  });
  it('rejects eleven selections and repeated preparation without launching duplicate jobs', async () => {
    const h = harness(); const tooMany = sample(); tooMany.games = Array.from({ length: 11 }, (_, i) => ({ ...tooMany.games[0], key: `x${i}` }));
    await expect(h.batch.start(tooMany)).rejects.toThrow(/1 and 10/);
    const first = h.batch.start(sample()); await expect(h.batch.start(sample())).rejects.toThrow(/already being prepared/); await first; await waitFor(() => !h.batch.getSnapshot().running); h.batch.dispose();
  });
  it('one failed game is excluded while another game still completes and saves', async () => {
    const h = harness({ failFirst: true }); await h.batch.start(sample()); await waitFor(() => h.batch.getSnapshot().manifest.status === 'completed-with-skips');
    const report = h.batch.getSnapshot().report; expect(report.failed).toBe(1); expect(report.completed).toBe(1); expect(report.selected).toBe(2); expect(report.distributionDenominator).toBe(2); expect(report.games[0].accuracy).toBeNull(); h.batch.dispose();
  });
  it('pause checkpoints original history and resume preserves a compatible generation', async () => {
    const h = harness({ holdThird: true }); await h.batch.start(sample()); await waitFor(h.isHeld); await h.batch.pause();
    expect(h.batch.getSnapshot().manifest.status).toBe('paused');
    const partial = h.stores.reviews.get('chess.com:live:1:balanced').snapshot;
    expect(partial.done).toBe(1); h.batch.resume(); await waitFor(() => h.batch.getSnapshot().manifest.status === 'completed');
    const next = h.batch.getSnapshot().manifest.selectedGames[0].snapshot; expect(next.generation.id).toBe(partial.generation.id); expect(next.records[1]).toEqual(partial.records[1]); h.batch.dispose();
  });
  it('cancel retains completed evidence and marks unreviewed games skipped', async () => {
    const h = harness({ holdThird: true }); await h.batch.start(sample()); await waitFor(h.isHeld); await h.batch.cancel();
    expect(h.batch.getSnapshot().manifest.status).toBe('cancelled'); expect(h.batch.getSnapshot().report.skipped).toBe(2); expect(h.batch.getSnapshot().report.meanGameAccuracy).toBeNull(); h.batch.dispose();
  });
  it('a compatible completed cache is joined without new engine jobs', async () => {
    const h = harness(); await h.batch.start(sample()); await waitFor(() => h.batch.getSnapshot().manifest.status === 'completed'); const calls = h.analyze.mock.calls.length;
    await h.batch.start(sample()); await waitFor(() => h.batch.getSnapshot().manifest.status === 'completed'); expect(h.analyze.mock.calls.length).toBe(calls); h.batch.dispose();
  });
  it('a saved running batch restores paused, never automatically restarting work', async () => {
    const h = harness({ holdThird: true }); await h.batch.start(sample()); await waitFor(h.isHeld); await h.batch.pause();
    const other = createBatchReview({ library: h.library, coordinator: h.coordinator }); const count = h.analyze.mock.calls.length;
    await other.restore('batch-1'); expect(other.getSnapshot().running).toBe(false); expect(other.getSnapshot().manifest.status).toBe('paused'); expect(h.analyze.mock.calls.length).toBe(count); other.dispose(); h.batch.dispose();
  });
});

describe('hand-checkable mixed-color report aggregates', () => {
  it('uses the actual target color for WDL, ratings, counts and denominators', async () => {
    const h = harness(); await h.batch.start(sample()); await waitFor(() => h.batch.getSnapshot().manifest.status === 'completed');
    const report = h.batch.getSnapshot().report;
    expect(report.results).toEqual({ win: 1, draw: 0, loss: 1, unknown: 0 }); expect(report.meanGameAccuracy).toBe(100); expect(report.distributionDenominator).toBe(4);
    expect(Object.values(report.distribution).reduce((a, b) => a + b, 0)).toBe(4); expect(report.games.map(game => game.observedRating)).toEqual([1500, 1600]);
    expect(report.games.map(game => game.color)).toEqual(['w', 'b']); expect(report.openings.reduce((sum, group) => sum + group.count, 0)).toBe(2); h.batch.dispose();
  });
  it('excludes provisional games from scored metrics but not selected-game results', async () => {
    const h = harness(); await h.batch.start(sample()); await waitFor(() => h.batch.getSnapshot().manifest.status === 'completed');
    const manifest = structuredClone(h.batch.getSnapshot().manifest); manifest.selectedGames[0].snapshot.records[1].provisional = true;
    const report = buildPlayerReport(manifest); expect(report.completed).toBe(1); expect(report.provisional).toBe(1); expect(report.selected).toBe(2); expect(report.distributionDenominator).toBe(2); expect(report.results.loss).toBe(1); h.batch.dispose();
  });
  it('does not mix a declared old scoring version with current review snapshots', async () => {
    const h = harness(); await h.batch.start(sample()); await waitFor(() => h.batch.getSnapshot().manifest.status === 'completed');
    const manifest = structuredClone(h.batch.getSnapshot().manifest); manifest.reviewVersions.accuracy = 'old';
    const report = buildPlayerReport(manifest); expect(report.completed).toBe(0); expect(report.meanGameAccuracy).toBeNull(); expect(report.distributionDenominator).toBe(0); h.batch.dispose();
  });
  it('phase rule is explicit, deterministic and actual-material based after move 12', () => {
    expect(reportPhase({ number: 12 })).toBe('opening'); expect(reportPhase({ number: 13, before: '7k/8/8/8/8/8/P7/K7 w - - 0 13' })).toBe('endgame');
    expect(reportPhase({ number: 13, before: new Chess().fen() })).toBe('middlegame');
  });
});
