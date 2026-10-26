import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let handler;
beforeEach(async () => {
  vi.resetModules();
  handler = (await import('../../api/chesscom/resolve.js')).default;
});
afterEach(() => vi.unstubAllGlobals());
function request(url, method = 'GET') {
  let status, headers, data;
  const res = {
    destroyed: false,
    writeHead(value, values) { status = value; headers = values; },
    end(body) { data = JSON.parse(body); },
  };
  const completion = handler({ method, url: `/api/chesscom/resolve?url=${encodeURIComponent(url)}` }, res);
  return { completion, result: () => ({ status, headers, data }) };
}
const target = 'https://www.chess.com/game/live/123456';

describe('hosted shared public-link handler', () => {
  it('returns an awaitable result and the same bounded metadata as local middleware', async () => {
    const fetch = vi.fn(async () => new Response('<meta property="og:title" content="Alice vs Bob">', { headers: { 'Content-Type': 'text/html' } }));
    vi.stubGlobal('fetch', fetch);
    const response = request(target);
    expect(response.completion).toBeInstanceOf(Promise);
    await response.completion;
    expect(response.result()).toMatchObject({ status: 200, data: { usernames: ['alice', 'bob'], month: null } });
    expect(response.result().headers['Cache-Control']).toBe('no-store');
    expect(fetch.mock.calls[0][1].headers.Cookie).toBeUndefined();
  });
  it('rejects private targets and non-GET methods without external fetch', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(request('http://127.0.0.1/secret').result().status).toBe(400);
    expect(request(target, 'POST').result().status).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('refuses an unlimited warm-instance queue and allows new work after completion', async () => {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const fetch = vi.fn(async () => { await held; return new Response('', { headers: { 'Content-Type': 'text/html' } }); });
    vi.stubGlobal('fetch', fetch);
    const first = request(target), second = request('https://www.chess.com/game/live/234567');
    expect(request('https://www.chess.com/game/live/345678').result().status).toBe(429);
    release(); await Promise.all([first.completion, second.completion]);
    const next = request('https://www.chess.com/game/live/456789'); await next.completion;
    expect(next.result().status).toBe(200); expect(fetch).toHaveBeenCalledTimes(3);
  });
});
