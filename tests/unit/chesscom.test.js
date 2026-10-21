import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let api;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const archive = (user, month = '2026/10') => `https://api.chess.com/pub/player/${user}/games/${month}`;
const game = (id = '98765', type = 'live', extra = {}) => ({ url: `https://www.chess.com/game/${type}/${id}`, pgn: '1. e4 e5 *', rules: 'chess', end_time: 100, time_class: 'rapid', ...extra });
beforeEach(async () => { vi.resetModules(); api = await import('../../src/chesscom.js'); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Chess.com usernames and public link validation', () => {
  it('normalizes valid usernames with an optional @', () => expect(api.normalizeUsername(' @Sample_User-12 ')).toBe('sample_user-12'));
  it.each(['a', '', '../erik', 'abc/def', 'with spaces', '<script>', 'a'.repeat(31)])('rejects unsafe username %s', name => expect(() => api.normalizeUsername(name)).toThrow());
  it.each([
    ['https://www.chess.com/game/live/12345', 'live', '12345'],
    ['https://chess.com/analysis/game/daily/12345?tab=review', 'daily', '12345'],
    ['https://www.chess.com/live/game/54321', 'live', '54321'],
    ['https://www.chess.com/analysis/game/live/12345/analysis', 'live', '12345'],
  ])('accepts and canonicalizes public game URL %s', (url, type, id) => {
    expect(api.parseChessComUrl(url)).toEqual({ type, id, url: `https://www.chess.com/game/${type}/${id}` });
  });
  it.each(['http://www.chess.com/game/live/1', 'https://www.chess.com.evil.test/game/live/1', 'https://evil.test/game/live/1', 'https://u:p@www.chess.com/game/live/1', 'https://www.chess.com:8443/game/live/1', 'https://www.chess.com/callback/live/game/1', 'https://www.chess.com/analysis', 'https://www.chess.com/game/live/abc'])('rejects non-public or unsafe URL %s', url => expect(() => api.parseChessComUrl(url)).toThrow());
});

describe('official archive imports, failure and cancellation', () => {
  it('uses only trusted matching account archive paths and sorts newest first', async () => {
    const fetch = vi.fn(async () => json({ archives: [archive('alice', '2025/04'), 'https://evil.test/pub/player/alice/games/2026/11', archive('bob'), archive('alice', '2026/99'), archive('alice')] }));
    vi.stubGlobal('fetch', fetch);
    const result = await api.getArchives('Alice');
    expect(result.archives.map(item => item.month)).toEqual(['2026-10', '2025-04']);
    expect(fetch.mock.calls[0][0]).toBe('https://api.chess.com/pub/player/alice/games/archives');
    expect(fetch.mock.calls[0][1].credentials).toBe('omit');
  });
  it('returns completed standard PGN games newest first and excludes variants', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ games: [game('1', 'live', { end_time: 1 }), game('2', 'daily', { end_time: 3 }), game('3', 'live', { rules: 'chess960' }), game('4', 'live', { pgn: '' })] })));
    const result = await api.getMonthGames({ path: '/pub/player/alice/games/2026/10' });
    expect(result.map(item => item.url)).toEqual([game('2', 'daily').url, game('1').url]);
  });
  it('rejects bad archive paths before issuing a fetch', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(api.getMonthGames({ path: '/pub/player/alice/games/2026/13' })).rejects.toThrow('Invalid archive month');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([[404, /not found/], [429, /rate limiting/], [503, /HTTP 503/]])('reports HTTP %s as actionable feedback', async (status, pattern) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, status)));
    await expect(api.getArchives('alice')).rejects.toThrow(pattern);
  });
  it('reports a network error without faking game data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Network failure'); }));
    await expect(api.getArchives('alice')).rejects.toThrow(/Could not reach Chess.com/);
  });
  it('rejects an unreadable or empty archive list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ archives: [] })));
    await expect(api.getArchives('alice')).rejects.toThrow(/No completed public games/);
  });
  it('does not fetch after an already aborted import', async () => {
    const controller = new AbortController(); controller.abort();
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(api.getArchives('alice', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('aborts an in-flight import rather than displaying stale results', async () => {
    vi.stubGlobal('fetch', vi.fn((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))));
    const controller = new AbortController(), result = api.getArchives('alice', controller.signal);
    setTimeout(() => controller.abort(), 5);
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('serializes requests and caches successful archive reads', async () => {
    let active = 0, maximum = 0;
    const fetch = vi.fn(async url => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 5)); active--;
      const user = url.includes('alice') ? 'alice' : 'bob';
      return json({ archives: [archive(user)] });
    });
    vi.stubGlobal('fetch', fetch);
    await Promise.all([api.getArchives('alice'), api.getArchives('bob')]);
    expect(maximum).toBe(1);
    await api.getArchives('alice'); expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('exact-ID game link lookup', () => {
  it('searches a specified player and month without relying on the public-page resolver', async () => {
    const fetch = vi.fn(async url => url.endsWith('/archives') ? json({ archives: [archive('alice')] }) : json({ games: [game('98765', 'daily'), game('98765'), game('198765')] }));
    vi.stubGlobal('fetch', fetch);
    const result = await api.findGameByUrl({ url: game().url, username: 'alice', month: '2026-10' });
    expect(result.url).toBe(game().url); expect(result.importUsername).toBe('alice');
    expect(fetch.mock.calls.every(([url]) => url.startsWith('https://api.chess.com/pub/'))).toBe(true);
  });
  it('resolves automatic username metadata then checks the exact game archive ID', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => url.startsWith('/api/') ? json({ usernames: ['alice'], month: '2026-10' }) : url.endsWith('/archives') ? json({ archives: [archive('alice')] }) : json({ games: [game()] })));
    const result = await api.findGameByUrl({ url: game().url });
    expect(result.url).toBe(game().url);
  });
  it('does not stop at an unrelated account linked on the public page', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (url.startsWith('/api/')) return json({ usernames: ['unrelated', 'alice'], month: '2026-10' });
      if (url.endsWith('/archives')) return json({ archives: [archive(url.includes('unrelated') ? 'unrelated' : 'alice')] });
      return json({ games: url.includes('unrelated') ? [game('11111')] : [game()] });
    }));
    await expect(api.findGameByUrl({ url: game().url })).resolves.toMatchObject({ url: game().url, importUsername: 'alice' });
  });
  it('explains the username fallback when public metadata is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ usernames: [], month: null })));
    await expect(api.findGameByUrl({ url: game().url })).rejects.toThrow(/Add either player’s username/);
  });
  it('does not confuse a daily game with a live game having the same numeric ID', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => url.endsWith('/archives') ? json({ archives: [archive('alice')] }) : json({ games: [game('98765', 'daily')] })));
    await expect(api.findGameByUrl({ url: game().url, username: 'alice' })).rejects.toThrow(/not found/);
  });
  it('bounds a missing-link search to 18 archive months', async () => {
    const archives = Array.from({ length: 25 }, (_, i) => archive('alice', `${2026 - Math.floor(i / 12)}/${String(12 - i % 12).padStart(2, '0')}`));
    const fetch = vi.fn(async url => url.endsWith('/archives') ? json({ archives }) : json({ games: [] }));
    vi.stubGlobal('fetch', fetch);
    await expect(api.findGameByUrl({ url: game().url, username: 'alice' })).rejects.toThrow(/not found/);
    expect(fetch).toHaveBeenCalledTimes(19);
  });
});
