import { describe, expect, it, vi } from 'vitest';
import { chessComRow, createImportStore } from '../../src/importState.js';
import { workspaceLayout } from '../../src/useWorkspaceLayout.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const result = name => ({ account: { username: name, archives: [] }, games: [{ key: name, pgn: '1. e4 *' }], month: '' });

describe('single-owner import drafts and request identity', () => {
  it('retains independent PGN/FEN/provider drafts through tab changes', () => {
    const store = createImportStore(); store.setText('pgn', '1. e4 *'); store.setText('fen', 'fen draft');
    store.patchProvider('chesscom', { username: 'alice', url: 'link draft', filter: 'rapid' });
    store.setTab('pgn'); store.setTab('chesscom'); store.setTab('fen');
    expect(store.getSnapshot()).toMatchObject({ pgn: '1. e4 *', fen: 'fen draft', providers: { chesscom: { username: 'alice', url: 'link draft', filter: 'rapid' } } }); store.dispose();
  });
  it('changing presentation fields neither restarts nor aborts an active search', async () => {
    const wait = deferred(); let signal;
    const search = vi.fn((draft, task) => { signal = task.signal; return wait.promise; });
    const store = createImportStore({ chesscom: { search } }); const pending = store.search('chesscom');
    store.setTab('pgn'); store.setTab('chesscom'); store.patchProvider('chesscom', { mode: 'url' });
    expect(search).toHaveBeenCalledTimes(1); expect(signal.aborted).toBe(false);
    wait.resolve(result('alice')); await pending; expect(store.getSnapshot().providers.chesscom.games[0].key).toBe('alice'); store.dispose();
  });
  it('Cancel rejects late successes even when a transport ignores AbortSignal', async () => {
    const wait = deferred(), store = createImportStore({ chesscom: { search: () => wait.promise } });
    const pending = store.search('chesscom'); store.cancel('chesscom'); wait.resolve(result('old')); await pending;
    expect(store.getSnapshot().providers.chesscom).toMatchObject({ busy: false, games: [], error: '' }); store.dispose();
  });
  it('a newer search wins over older responses and older errors', async () => {
    const first = deferred(), second = deferred(); let count = 0;
    const store = createImportStore({ chesscom: { search: () => (++count === 1 ? first : second).promise } });
    const one = store.search('chesscom'); const two = store.search('chesscom'); second.resolve(result('new')); await two;
    first.reject(new Error('stale failure')); await one;
    expect(store.getSnapshot().providers.chesscom).toMatchObject({ games: [{ key: 'new', pgn: '1. e4 *' }], error: '', busy: false }); store.dispose();
  });
  it('a successful import invalidates requests from every provider without deleting drafts', async () => {
    const first = deferred(), second = deferred();
    const store = createImportStore({ chesscom: { search: () => first.promise }, other: { search: () => second.promise } });
    store.setText('pgn', 'keep draft'); const one = store.search('chesscom'), two = store.search('other');
    store.markLoaded('selected-game'); first.resolve(result('stale-a')); second.resolve(result('stale-b')); await Promise.all([one, two]);
    expect(store.getSnapshot()).toMatchObject({ loadedKey: 'selected-game', pgn: 'keep draft' });
    expect(store.getSnapshot().providers.chesscom.games).toEqual([]); expect(store.getSnapshot().providers.other.games).toEqual([]); store.dispose();
  });
  it('reports current provider failures and leaves recovery possible', async () => {
    const store = createImportStore({ chesscom: { search: async () => { throw new Error('HTTP 429 - wait'); } } });
    await store.search('chesscom'); expect(store.getSnapshot().providers.chesscom).toMatchObject({ busy: false, error: 'HTTP 429 - wait' }); store.dispose();
  });
  it('a pending file read survives view changes but not a newer file selection', async () => {
    const first = deferred(), store = createImportStore();
    const old = store.readPgnFile({ size: 30, text: () => first.promise }); store.setTab('chesscom');
    await store.readPgnFile({ size: 10, text: async () => '1. d4 *' }); first.resolve('1. e4 *'); await old;
    expect(store.getSnapshot().pgn).toBe('1. d4 *'); store.dispose();
  });
  it('enforces file size and keeps prior valid PGN on failure', async () => {
    const store = createImportStore(); store.setText('pgn', '1. e4 *');
    await store.readPgnFile({ size: 2000001, text: async () => 'oversize' });
    expect(store.getSnapshot().pgn).toBe('1. e4 *'); expect(store.getSnapshot().textErrors.pgn).toMatch(/under 2 MB/); store.dispose();
  });
  it('disposal aborts outstanding work and never publishes late data', async () => {
    const wait = deferred(), observer = vi.fn(); const store = createImportStore({ chesscom: { search: () => wait.promise } });
    store.subscribe(observer); const pending = store.search('chesscom'); store.dispose(); const count = observer.mock.calls.length;
    wait.resolve(result('late')); await pending; expect(observer).toHaveBeenCalledTimes(count);
  });
  it('normalizes concrete provider identity, ratings, color and original PGN for the shared picker', () => {
    const row = chessComRow({ url: 'https://www.chess.com/game/live/123', pgn: '1. e4 *', white: { username: 'Alice', rating: 1500, result: 'win' }, black: { username: 'Bob', rating: 1600 }, time_class: 'rapid', time_control: '300+3', end_time: 1700000000 }, 'bob');
    expect(row).toMatchObject({ key: 'chess.com:live:123', provider: 'chess.com', id: '123', color: 'b', pgn: '1. e4 *', result: '1–0', white: { name: 'Alice', rating: 1500 }, black: { name: 'Bob', rating: 1600 } });
  });
});

describe('responsive composition budget', () => {
  it('uses rail, drawer, tablet and phone breakpoints without guessing engine ownership', () => {
    expect(workspaceLayout(1440)).toMatchObject({ rail: true, desktop: true, reportColumn: false });
    expect(workspaceLayout(1024)).toMatchObject({ rail: false, desktop: true });
    expect(workspaceLayout(768)).toMatchObject({ tablet: true, phone: false });
    expect(workspaceLayout(390)).toMatchObject({ phone: true, tablet: false });
  });
  it('only docks a fourth column at 1600+ with a >=480px board and 1440px shell cap', () => {
    expect(workspaceLayout(1599).reportColumn).toBe(false);
    for (const width of [1600, 1920, 3000]) { expect(workspaceLayout(width).reportColumn).toBe(true); expect(workspaceLayout(width).reportBoardBudget).toBe(524); }
  });
});
