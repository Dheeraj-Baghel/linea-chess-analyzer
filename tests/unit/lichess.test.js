import { describe, expect, it, vi } from 'vitest';
import { createLichessClient, normalizeLichessGame, normalizeLichessUsername, parseLichessGameId } from '../../src/lichess.js';
import { lichessRecord } from '../fixtures/lichess-games.js';

const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const ndjson = data => new Response(data.map(item => JSON.stringify(item)).join('\n') + '\n', { headers: { 'content-type': 'application/x-ndjson' } });

describe('public Lichess identity and completed-game normalization', () => {
  it('accepts eight-character IDs and public orientation links', () => {
    expect(parseLichessGameId('Abcd1234')).toBe('Abcd1234');
    expect(parseLichessGameId('https://lichess.org/Abcd1234/black#32')).toBe('Abcd1234');
    expect(normalizeLichessUsername('@Lance5500')).toBe('lance5500');
  });
  for (const value of ['https://evil.example/Abcd1234', 'https://lichess.org.evil.example/Abcd1234', 'https://user:pass@lichess.org/Abcd1234', 'https://lichess.org:444/Abcd1234', 'https://lichess.org/study/Abcd1234', 'https://lichess.org/Abcd1234abcd', 'bad-id']) it(`rejects non-public or ambiguous identity: ${value}`, () => expect(() => parseLichessGameId(value)).toThrow());
  it('preserves source PGN, clock tags, metadata, rating and player color', () => {
    const data = lichessRecord(), row = normalizeLichessGame(data, 'Bob');
    expect(row).toMatchObject({ id: 'Abcd1234', key: 'lichess:Abcd1234', color: 'b', result: '0–1', timeControl: '300+3', white: { name: 'Alice', rating: 1500 }, black: { name: 'Bob', rating: 1600 } });
    expect(row.pgn).toBe(data.pgn); expect(row.pgn).toContain('[%clk 0:04:59]');
  });
  for (const status of ['created', 'started', 'aborted', 'noStart', 'variantEnd']) it(`rejects incomplete/unsupported status ${status}`, () => expect(() => normalizeLichessGame(lichessRecord(undefined, { status }))).toThrow(/completed/));
  it('rejects variants, wrong PGN identity, missing/invalid source and timestamps', () => {
    expect(() => normalizeLichessGame(lichessRecord(undefined, { variant: 'chess960' }))).toThrow(/standard/);
    expect(() => normalizeLichessGame(lichessRecord(undefined, { pgn: lichessRecord('Wxyz9999').pgn }))).toThrow(/identity/);
    expect(() => normalizeLichessGame(lichessRecord(undefined, { pgn: '' }))).toThrow(/PGN/);
    expect(() => normalizeLichessGame(lichessRecord(undefined, { pgn: '1. e4 badmove' }))).toThrow(/truncated/);
    expect(() => normalizeLichessGame(lichessRecord(undefined, { createdAt: NaN }))).toThrow(/timestamp/);
  });
});

describe('bounded official export requests', () => {
  it('uses exact public single-game JSON options and no credentials', async () => {
    const fetchImpl = vi.fn(async () => json(lichessRecord())); const client = createLichessClient({ fetchImpl });
    await client.game('Abcd1234');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://lichess.org/game/export/Abcd1234?pgnInJson=true&clocks=true&opening=true&evals=false');
    expect(init.credentials).toBe('omit'); expect(init.headers).toEqual({ Accept: 'application/json' });
  });
  it('enforces exact response ID instead of importing an unrelated game', async () => {
    const client = createLichessClient({ fetchImpl: async () => json(lichessRecord('Wxyz9999')) });
    await expect(client.game('Abcd1234')).rejects.toThrow(/different game ID/);
  });
  it('bounds history and supplies all completed-game/clock/source flags', async () => {
    const fetchImpl = vi.fn(async () => ndjson([lichessRecord()]));
    const result = await createLichessClient({ fetchImpl }).history('Bob', { until: 1790000000000 });
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/games/user/bob');
    for (const [key, value] of Object.entries({ max: '20', ongoing: 'false', finished: 'true', clocks: 'true', opening: 'true', pgnInJson: 'true', sort: 'dateDesc', until: '1790000000000' })) expect(url.searchParams.get(key)).toBe(value);
    expect(result.games).toHaveLength(1); expect(result.hasMore).toBe(false);
  });
  it('reports empty history and skips unsupported rows without inventing games', async () => {
    const client = createLichessClient({ fetchImpl: async () => ndjson([lichessRecord(undefined, { variant: 'chess960' }), lichessRecord('Wxyz9999', { status: 'started' })]) });
    const result = await client.history('bob'); expect(result.games).toEqual([]); expect(result.notice).toMatch(/2 unsupported/);
    expect((await createLichessClient({ fetchImpl: async () => ndjson([]) }).history('bob')).games).toEqual([]);
  });
  it('deduplicates IDs and stops a stalled inclusive history cursor', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => lichessRecord(`AB${String(i).padStart(6, '0')}`, { createdAt: 1790000000000 }));
    const client = createLichessClient({ fetchImpl: async () => ndjson(rows) });
    expect((await client.history('bob')).hasMore).toBe(true);
    const stopped = await client.history('bob', { until: 1790000000000 }); expect(stopped.hasMore).toBe(false); expect(stopped.notice).toMatch(/did not advance/);
    const duplicate = await createLichessClient({ fetchImpl: async () => ndjson([lichessRecord(), lichessRecord()]) }).history('bob'); expect(duplicate.games).toHaveLength(1);
  });
  it('does not discard valid history when a completed resignation has zero recorded moves', async () => {
    const empty = lichessRecord('Zero0001', { status: 'resign', moves: '', pgn: '[Result "0-1"]\n[GameId "Zero0001"]\n\n0-1' });
    expect(() => normalizeLichessGame(empty)).toThrow(/no recorded moves/);
    const result = await createLichessClient({ fetchImpl: async () => ndjson([lichessRecord(), empty]) }).history('bob');
    expect(result.games).toHaveLength(1); expect(result.games[0].id).toBe('Abcd1234'); expect(result.notice).toMatch(/zero-move/);
  });
  it('parses chunked NDJSON and refuses partial/truncated batches', async () => {
    const data = new TextEncoder().encode(JSON.stringify(lichessRecord()) + '\n');
    const stream = new ReadableStream({ start(controller) { controller.enqueue(data.slice(0, 17)); controller.enqueue(data.slice(17)); controller.close(); } });
    const client = createLichessClient({ fetchImpl: async () => new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } }) });
    expect((await client.history('bob')).games).toHaveLength(1);
    const broken = createLichessClient({ fetchImpl: async () => new Response('{"id":', { headers: { 'content-type': 'application/x-ndjson' } }) });
    await expect(broken.history('bob')).rejects.toThrow(/incomplete/);
  });
  it('rejects wrong media type, excessive bytes and unbounded result count', async () => {
    await expect(createLichessClient({ fetchImpl: async () => new Response('<html/>', { headers: { 'content-type': 'text/html' } }) }).game('Abcd1234')).rejects.toThrow(/format/);
    await expect(createLichessClient({ fetchImpl: async () => new Response('x', { headers: { 'content-type': 'application/json', 'content-length': '5000000' } }) }).game('Abcd1234')).rejects.toThrow(/too large/);
    await expect(createLichessClient({ fetchImpl: async () => ndjson(Array(21).fill(lichessRecord())) }).history('bob')).rejects.toThrow(/bounded batch/);
  });
  for (const status of [401, 403, 404, 503]) it(`reports recoverable HTTP ${status}`, async () => {
    const client = createLichessClient({ fetchImpl: async () => new Response('', { status }) });
    await expect(client.game('Abcd1234')).rejects.toThrow(status === 503 ? /503/ : /unavailable/);
  });
  it('respects 429 cooldown without automatic retries', async () => {
    let time = 1000000;
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '120' } })).mockImplementation(async () => json(lichessRecord()));
    const client = createLichessClient({ fetchImpl, now: () => time });
    await expect(client.game('Abcd1234')).rejects.toThrow(/120 seconds/);
    await expect(client.game('Abcd1234')).rejects.toThrow(/120 seconds/); expect(fetchImpl).toHaveBeenCalledTimes(1);
    time += 120001; expect((await client.game('Abcd1234')).id).toBe('Abcd1234');
  });
  it('cancels queued requests without issuing another fetch', async () => {
    let release; const held = new Promise(resolve => { release = resolve; });
    const fetchImpl = vi.fn(async () => { await held; return json(lichessRecord()); });
    const client = createLichessClient({ fetchImpl }), first = client.game('Abcd1234'), controller = new AbortController();
    const second = client.game('Abcd1234', controller.signal); controller.abort(); release();
    await first; await expect(second).rejects.toMatchObject({ name: 'AbortError' }); expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
