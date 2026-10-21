import { parseGame } from './chess.js';

// Phase 3A: official public exports only. Exact paths/options are pinned in
// artifacts/references/phase3. No login, credentials, private player ID or eval API.
const ORIGIN = 'https://lichess.org';
const COMPLETE = new Set(['mate', 'resign', 'stalemate', 'timeout', 'draw', 'outoftime', 'cheat', 'unknownFinish', 'insufficientMaterialClaim']);
const PAGE_SIZE = 20, MAX_BYTES = 4000000, MAX_PGN = 2000000;
const abortError = () => new DOMException('Lichess import cancelled', 'AbortError');

export function normalizeLichessUsername(value) {
  const username = value.trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9_-]{2,30}$/.test(username)) throw new Error('Enter a Lichess username using 2–30 letters, numbers, underscores or hyphens.');
  return username.toLowerCase();
}
export function parseLichessGameId(value) {
  const input = value.trim();
  if (/^[a-zA-Z0-9]{8}$/.test(input)) return input;
  let url;
  try { url = new URL(input); } catch { throw new Error('Use a public Lichess game link or its eight-character game ID.'); }
  if (url.protocol !== 'https:' || !['lichess.org', 'www.lichess.org'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Use an https://lichess.org public game link.');
  const match = url.pathname.match(/^\/([a-zA-Z0-9]{8})(?:\/(?:white|black))?\/?$/);
  if (!match) throw new Error('Use an eight-character public game ID, not a study, position URL or private player link.');
  return match[1];
}

export function normalizeLichessGame(data, username = '') {
  if (!data || !/^[a-zA-Z0-9]{8}$/.test(data.id || '')) throw new Error('Lichess returned an unreadable game identity.');
  if (data.variant !== 'standard') throw new Error('Only standard chess is supported; this Lichess game uses a variant or a custom starting position.');
  if (!COMPLETE.has(data.status)) throw new Error('Only completed public games can be imported. This game is ongoing, aborted or unavailable.');
  if (typeof data.pgn !== 'string' || !data.pgn.trim()) throw new Error('Lichess did not include a complete PGN. Try its downloaded PGN instead.');
  if (data.pgn.length > MAX_PGN) throw new Error('This Lichess PGN exceeds the 2 MB per-game limit.');
  let game;
  try { game = parseGame(data.pgn); } catch { throw new Error('Lichess returned an unreadable or truncated PGN. No game was replaced.'); }
  if (!game.moves.length) {
    const error = new Error('This completed Lichess game has no recorded moves to analyze.');
    error.code = 'NO_RECORDED_MOVES'; throw error;
  }
  if (!['1-0', '0-1', '1/2-1/2'].includes(game.headers.Result)) throw new Error('Lichess did not return a completed recorded game.');
  if (game.headers.GameId && game.headers.GameId !== data.id) throw new Error('Lichess game identity does not match its PGN.');
  const source = username ? normalizeLichessUsername(username) : '';
  const white = data.players?.white, black = data.players?.black;
  const color = black?.user?.id?.toLowerCase() === source ? 'b' : white?.user?.id?.toLowerCase() === source ? 'w' : null;
  const createdAt = Number(data.createdAt);
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0) throw new Error('Lichess returned an invalid game timestamp.');
  return {
    key: `lichess:${data.id}`, provider: 'lichess', id: data.id, url: `${ORIGIN}/${data.id}`,
    pgn: data.pgn, username: source, color, createdAt,
    white: { name: white?.user?.name || game.headers.White || 'White', rating: Number.isFinite(white?.rating) ? white.rating : null },
    black: { name: black?.user?.name || game.headers.Black || 'Black', rating: Number.isFinite(black?.rating) ? black.rating : null },
    result: game.headers.Result === '1-0' ? '1–0' : game.headers.Result === '0-1' ? '0–1' : '½–½',
    format: data.speed || 'unknown', timeControl: game.headers.TimeControl && game.headers.TimeControl !== '?' ? game.headers.TimeControl : data.clock ? `${data.clock.initial}+${data.clock.increment}` : data.daysPerTurn ? `${data.daysPerTurn} days/move` : 'Not supplied',
    date: new Date(createdAt).toISOString(), rated: Boolean(data.rated),
  };
}

async function boundedText(response, signal) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Lichess response is too large. Use a smaller export.');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('Lichess response is too large.');
    if (signal.aborted) throw abortError();
    return text;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    for (;;) {
      if (signal.aborted) throw abortError();
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('Lichess response is too large. Use a smaller export.');
      text += decoder.decode(next.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}

export function createLichessClient({ fetchImpl = (...args) => fetch(...args), now = () => Date.now(), timeoutMs = 30000 } = {}) {
  let queue = Promise.resolve(), cooldownUntil = 0;
  const request = (path, accept, signal) => {
    const task = queue.catch(() => {}).then(async () => {
      if (signal?.aborted) throw abortError();
      if (now() < cooldownUntil) throw new Error(`Lichess is rate limiting requests. Wait ${Math.ceil((cooldownUntil - now()) / 1000)} seconds, then search again.`);
      const controller = new AbortController(), abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, timeoutMs);
      try {
        const response = await fetchImpl(`${ORIGIN}${path}`, { signal: controller.signal, credentials: 'omit', headers: { Accept: accept } });
        if (response.status === 429) {
          const header = response.headers.get('retry-after');
          const seconds = header && /^\d+$/.test(header) ? Number(header) : Math.max(0, (Date.parse(header || '') - now()) / 1000) || 60;
          cooldownUntil = now() + Math.max(60, seconds) * 1000;
          throw new Error(`Lichess is rate limiting requests. Wait at least ${Math.ceil(Math.max(60, seconds))} seconds, then search again.`);
        }
        if ([401, 403, 404].includes(response.status)) throw new Error('That public Lichess player or game is unavailable. Private games and accounts requiring authorization are not supported.');
        if (!response.ok) throw new Error(`Lichess could not return this export (HTTP ${response.status}). Try again or import its PGN.`);
        if (!response.headers.get('content-type')?.toLowerCase().includes(accept)) throw new Error('Lichess returned an unexpected response format, not a game export.');
        return await boundedText(response, controller.signal);
      } catch (error) {
        if (signal?.aborted) throw abortError();
        if (controller.signal.aborted) throw new Error('Lichess took too long to respond. Try again or import the PGN.');
        if (error instanceof TypeError) throw new Error('Could not reach Lichess or finish its export. Check the connection and try again.');
        throw error;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    });
    queue = task; return task;
  };
  return {
    async game(value, signal) {
      const id = parseLichessGameId(value);
      const text = await request(`/game/export/${id}?pgnInJson=true&clocks=true&opening=true&evals=false`, 'application/json', signal);
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('Lichess returned incomplete or invalid JSON. No game was replaced.'); }
      if (data.id !== id) throw new Error('Lichess returned a different game ID than requested.');
      return normalizeLichessGame(data);
    },
    async history(username, { until, signal, format = 'all' } = {}) {
      const name = normalizeLichessUsername(username);
      const query = new URLSearchParams({ max: String(PAGE_SIZE), pgnInJson: 'true', clocks: 'true', opening: 'true', evals: 'false', ongoing: 'false', finished: 'true', sort: 'dateDesc', perfType: ['rapid', 'blitz', 'bullet'].includes(format) ? format : 'bullet,blitz,rapid' });
      if (until !== undefined && until !== null) {
        if (!Number.isSafeInteger(until) || until <= 0) throw new Error('Invalid Lichess history cursor. Start a new search.');
        query.set('until', String(until));
      }
      const text = await request(`/api/games/user/${encodeURIComponent(name)}?${query}`, 'application/x-ndjson', signal);
      let records;
      try { records = text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)); }
      catch { throw new Error('Lichess returned an incomplete or invalid NDJSON export. Retry this batch; existing results are preserved.'); }
      if (records.length > PAGE_SIZE) throw new Error('Lichess returned more games than the requested bounded batch.');
      const rows = [], dates = [];
      let omitted = 0;
      for (const data of records) {
        if (!Number.isSafeInteger(data.createdAt) || data.createdAt <= 0) throw new Error('Lichess returned an invalid history timestamp.');
        dates.push(data.createdAt);
        if (data.variant !== 'standard' || !COMPLETE.has(data.status)) { omitted++; continue; }
        try { rows.push(normalizeLichessGame(data, name)); }
        catch (error) { if (error.code === 'NO_RECORDED_MOVES') omitted++; else throw error; }
      }
      const cursor = dates.length ? Math.min(...dates) : null;
      // Inclusive overlap avoids losing games sharing the boundary timestamp.
      // Stop with an explicit notice if the service cannot advance that cursor.
      const stalled = until != null && cursor != null && cursor >= until;
      return { account: { username: name, archives: [] }, games: [...new Map(rows.map(row => [row.key, row])).values()], cursor, hasMore: records.length === PAGE_SIZE && !stalled, message: '', notice: stalled ? 'The service did not advance this history cursor. Start a more recent search or use a game link for another game.' : omitted ? `${omitted} unsupported, unfinished or zero-move games were omitted.` : '' };
    },
  };
}

const client = createLichessClient();
export const lichessAdapter = {
  async search(draft, { signal, progress }) {
    if (draft.mode === 'url') { progress('Reading a public completed Lichess game…'); const game = await client.game(draft.url, signal); return { account: { username: 'Game link', archives: [] }, games: [game], hasMore: false, cursor: null, notice: '' }; }
    progress('Loading up to 20 recent completed games…');
    return client.history(draft.username, { signal });
  },
  async more(state, { signal, progress }) {
    progress('Loading the next bounded batch…');
    return client.history(state.account.username, { until: state.cursor, signal });
  },
};
