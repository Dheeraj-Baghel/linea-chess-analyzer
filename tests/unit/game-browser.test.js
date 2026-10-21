import { describe, expect, it, vi } from 'vitest';
import { createGameBrowser, eligibleBrowserRow } from '../../src/gameBrowser.js';
import { assertSinglePgn } from '../../src/singlePgn.js';
const pgn = '[White "Alice"]\n[Black "Bob"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
const raw = (id, format = 'blitz') => ({ rules: 'chess', url: `https://www.chess.com/game/live/${id}`, pgn, white: { username: 'Alice', rating: 1500, result: 'checkmated' }, black: { username: 'Bob', rating: 1600, result: 'win' }, time_class: format, time_control: '180', end_time: id });
const row = (id, format = 'blitz') => ({ key: `lichess:${id}`, provider: 'lichess', id: String(id), pgn, format, color: 'w', white: { name: 'Alice' }, black: { name: 'Bob' }, date: new Date(id * 1000).toISOString() });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
describe('eligible cross-page game browser', () => {
  it('crosses sparse months, excludes daily games and finds the latest ten matching games', async () => {
    const month = vi.fn(async archive => archive.month === '2026-10' ? [raw(200), raw(199, 'daily')] : Array.from({ length: 12 }, (_, i) => raw(180 - i)));
    const browser = createGameBrowser({ archives: async () => ({ archives: [{ month: '2026-10' }, { month: '2026-09' }] }), month });
    await browser.search('chesscom', 'Alice'); expect(browser.getSnapshot().rows).toHaveLength(10); expect(month).toHaveBeenCalledTimes(2); expect(browser.getSnapshot().rows[0].id).toBe('200');
    expect(browser.sample().games).toHaveLength(10); browser.dispose();
  });
  it('caps browsing at 30 while analysis and selection stay at ten; cache feeds Load more', async () => {
    const month = vi.fn(async () => Array.from({ length: 40 }, (_, i) => raw(200 - i)));
    const browser = createGameBrowser({ archives: async () => ({ archives: [{ month: '2026-10' }] }), month });
    await browser.search('chesscom', 'Alice'); await browser.more(); await browser.more(); await browser.more();
    expect(browser.getSnapshot().rows).toHaveLength(30); expect(month).toHaveBeenCalledTimes(1);
    for (const item of browser.getSnapshot().rows.slice(0, 11)) browser.select(item.key);
    expect(browser.getSnapshot().selected).toHaveLength(10); expect(browser.getSnapshot().error).toMatch(/at most 10/); expect(browser.sample().games).toHaveLength(10); browser.dispose();
  });
  it('keeps format samples separate, reusing Chess.com month data without remapping unsupported formats', async () => {
    const month = vi.fn(async () => [raw(200, 'rapid'), raw(199, 'blitz'), raw(198, 'bullet'), raw(197, 'daily')]);
    const browser = createGameBrowser({ archives: async () => ({ archives: [{ month: '2026-10' }] }), month });
    await browser.search('chesscom', 'Alice'); browser.select(browser.getSnapshot().rows[0].key); const frozen = browser.sample(); await browser.filter('bullet');
    expect(browser.getSnapshot().rows.map(row => row.format)).toEqual(['bullet']); expect(browser.getSnapshot().selected).toEqual([]); expect(month).toHaveBeenCalledTimes(1); expect(frozen.games[0].format).toBe('rapid'); browser.dispose();
  });
  it('shows bounded partial history and continues instead of silently scanning lifetime history', async () => {
    const browser = createGameBrowser({ archives: async () => ({ archives: Array.from({ length: 8 }, (_, i) => ({ month: `month-${i}` })) }), month: async archive => [raw(100 - Number(archive.month.split('-')[1]))], pageLimit: 2 });
    await browser.search('chesscom', 'Alice'); expect(browser.getSnapshot().rows).toHaveLength(2); expect(browser.getSnapshot().notice).toMatch(/boundary/); await browser.continue(); expect(browser.getSnapshot().rows).toHaveLength(4); browser.dispose();
  });
  it('honors Lichess active format and inclusive overlap deduplication', async () => {
    const history = vi.fn(async (_, options) => ({ games: options.until ? [row(100), row(99), row(98)] : [row(101), row(100)], cursor: options.until ? 98 : 100, hasMore: !options.until }));
    const browser = createGameBrowser({ lichess: { history } }); await browser.search('lichess', 'Alice'); expect(browser.getSnapshot().rows).toHaveLength(4);
    await browser.filter('rapid'); expect(history.mock.calls.at(-1)[1].format).toBe('rapid'); expect(browser.getSnapshot().rows).toHaveLength(0); browser.dispose();
  });
  it('preserves completed pages on a rate limit and does not fabricate missing games', async () => {
    let count = 0; const browser = createGameBrowser({ lichess: { history: async () => { if (count++) throw new Error('429: wait at least 60 seconds'); return { games: [row(100)], cursor: 100, hasMore: true }; } } });
    await browser.search('lichess', 'Alice'); expect(browser.getSnapshot().rows).toHaveLength(1); expect(browser.getSnapshot().error).toMatch(/429/); expect(browser.sample().games).toHaveLength(1); browser.dispose();
  });
  it('cancel rejects late provider results without replacing state', async () => {
    let release; const pending = new Promise(resolve => { release = resolve; });
    const browser = createGameBrowser({ lichess: { history: () => pending } }); const task = browser.search('lichess', 'Alice'); await flush(); browser.cancel(); release({ games: [row(1)], hasMore: false }); await task;
    expect(browser.getSnapshot().rows).toHaveLength(0); expect(browser.getSnapshot().busy).toBe(false); browser.dispose();
  });
  it('does not score or include variants, unfinished games, absent identity or malformed PGNs', () => {
    expect(eligibleBrowserRow(row(1))).toBe(true);
    for (const value of [{ ...row(1), format: 'classical' }, { ...row(1), color: null }, { ...row(1), pgn: '1. e4 *' }, { ...row(1), pgn: 'not chess' }]) expect(eligibleBrowserRow(value)).toBe(false);
  });
  it('rejects multiple PGNs but ignores result tokens in comments and variations', () => {
    expect(() => assertSinglePgn(pgn + '\n' + pgn)).toThrow(/multiple/);
    expect(() => assertSinglePgn('1. e4 {example 1-0} e5 (1... c5 *) *')).not.toThrow();
  });
});
