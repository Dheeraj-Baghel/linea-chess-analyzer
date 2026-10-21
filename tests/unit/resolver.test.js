import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let handler;
const empty = { usernames: [], month: null };
const target = 'https://www.chess.com/game/live/123456';
const html = content => new Response(content, { headers: { 'Content-Type': 'text/html' } });
beforeEach(async () => {
  vi.resetModules();
  const { chessComResolver } = await import('../../server/chesscom-resolver.js');
  chessComResolver().configureServer({ middlewares: { use(path, callback) { expect(path).toBe('/api/chesscom/resolve'); handler = callback; } } });
});
afterEach(() => vi.unstubAllGlobals());
function request(url = target, method = 'GET') {
  return new Promise(resolve => {
    let status, headers;
    const response = { destroyed: false, writeHead(value, head) { status = value; headers = head; }, end(body) { resolve({ status, headers, data: JSON.parse(body) }); } };
    handler({ method, url: `/?url=${encodeURIComponent(url)}` }, response);
  });
}

describe('restricted public-link middleware', () => {
  it.each(['https://127.0.0.1/game/live/1', 'http://www.chess.com/game/live/1', 'https://www.chess.com.evil.test/game/live/1', 'https://user:pass@www.chess.com/game/live/1', 'https://www.chess.com:9443/game/live/1', 'https://www.chess.com/callback/live/game/1', 'https://www.chess.com/game/live/abc', 'file:///etc/passwd'])('refuses unsafe target %s without requesting it', async url => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await request(url)).status).toBe(400); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects unsupported methods without touching the public service', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await request(target, 'POST')).status).toBe(405); expect(fetch).not.toHaveBeenCalled();
  });
  it('extracts prioritized public game players and date metadata without forwarding cookies', async () => {
    const fetch = vi.fn(async () => html(`<a href="/member/unrelated">Other member</a><script>{"whiteUsername":"Alice","blackUsername":"Bob"}</script><meta property="og:title" content="Alice vs. Bob"><meta property="article:published_time" content="2026-10-18T12:00:00Z">`));
    vi.stubGlobal('fetch', fetch);
    const result = await request();
    expect(result.status).toBe(200); expect(result.data.usernames.slice(0, 2)).toEqual(['alice', 'bob']); expect(result.data.month).toBe('2026-10');
    expect(fetch.mock.calls[0][0]).toBe(target); expect(fetch.mock.calls[0][1].redirect).toBe('manual');
    expect(fetch.mock.calls[0][1].headers.Cookie).toBeUndefined();
    expect(result.headers['Cache-Control']).toBe('no-store'); expect(result.headers['X-Content-Type-Options']).toBe('nosniff');
  });
  it('caches metadata but never returns PGN or private account information', async () => {
    const fetch = vi.fn(async () => html('<meta property="og:title" content="Alice vs Bob">'));
    vi.stubGlobal('fetch', fetch); await request(); const second = await request();
    expect(fetch).toHaveBeenCalledTimes(1); expect(Object.keys(second.data)).toEqual(['usernames', 'month']);
  });
  it('never follows a redirect off the public Chess.com game host/path', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1:5432/secret' } }));
    vi.stubGlobal('fetch', fetch); expect((await request()).data).toEqual(empty); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('follows a bounded valid public-game redirect', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 301, headers: { Location: '/game/live/123456/' } })).mockResolvedValueOnce(html('<script>{"whiteUsername":"Alice","blackUsername":"Bob"}</script>'));
    vi.stubGlobal('fetch', fetch); expect((await request()).data.usernames).toEqual(['alice', 'bob']); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('preserves a documented username fallback for anti-bot or non-HTML responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Blocked', { status: 403, headers: { 'Content-Type': 'text/html' } })));
    expect((await request()).data).toEqual(empty);
  });
  it('limits large public-page content rather than buffering an unbounded response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { headers: { 'Content-Type': 'text/html', 'Content-Length': '4000000' } })));
    expect((await request()).data).toEqual(empty);
  });
  it('serializes public requests', async () => {
    let active = 0, max = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { active++; max = Math.max(max, active); await new Promise(resolve => setTimeout(resolve, 4)); active--; return html(''); }));
    await Promise.all([request(target), request('https://www.chess.com/game/daily/234567')]); expect(max).toBe(1);
  });
});
