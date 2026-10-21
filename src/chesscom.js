// Only completed, public standard games are imported. No Chess.com login or cookies.
// PubAPI has no documented numeric-game endpoint: resolve links through public page
// metadata, then find the exact ID in official monthly archives. If metadata is
// unavailable, let the user supply either player's username instead of guessing.
const API = 'https://api.chess.com';
const cache = new Map();
let requests = Promise.resolve(), cooldownUntil = 0;
const cancelled = () => new DOMException('Import cancelled', 'AbortError');

export function parseChessComUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Paste a full Chess.com game link, including https://.'); }
  if (url.protocol !== 'https:' || !['chess.com', 'www.chess.com'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Use an https://www.chess.com game link.');
  const match = url.pathname.match(/^\/(?:analysis\/)?game\/(live|daily)\/(\d{1,20})(?:\/(?:analysis|review))?\/?$/) || url.pathname.match(/^\/(live|daily)\/game\/(\d{1,20})\/?$/);
  if (!match) throw new Error('Use a completed game link such as https://www.chess.com/game/live/123456789. Analysis-board links without a game ID cannot be imported.');
  return { type: match[1], id: match[2], url: `https://www.chess.com/game/${match[1]}/${match[2]}` };
}

export function normalizeUsername(value) {
  const username = value.trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9_-]{2,30}$/.test(username)) throw new Error('Enter a Chess.com username using 2–30 letters, numbers, hyphens or underscores.');
  return username.toLowerCase();
}

async function publicJson(path, signal) {
  if (signal?.aborted) throw cancelled();
  const stored = cache.get(path);
  if (stored && Date.now() - stored.time < 120000) return stored.data;
  // Serialize requests, including across searches. Never flood the Published Data API.
  const task = requests.catch(() => {}).then(async () => {
    if (signal?.aborted) throw cancelled();
    if (Date.now() < cooldownUntil) throw new Error(`Chess.com is rate limiting requests. Wait ${Math.ceil((cooldownUntil - Date.now()) / 1000)} seconds, then continue.`);
    const controller = new AbortController();
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${API}${path}`, { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json' } });
      if (response.status === 404) throw new Error('That public player or archive was not found. Check the username or month.');
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        const ms = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Math.max(0, Date.parse(retry || '') - Date.now());
        cooldownUntil = Date.now() + Math.max(60000, Number.isFinite(ms) ? ms : 60000);
        throw new Error(`Chess.com is rate limiting requests. Wait at least ${Math.ceil((cooldownUntil - Date.now()) / 1000)} seconds, then continue.`);
      }
      if (!response.ok) throw new Error(`Chess.com could not return this archive (HTTP ${response.status}). Try again or import its PGN.`);
      if (Number(response.headers.get('content-length')) > 4000000) throw new Error('Chess.com archive exceeds the 4 MB response limit. Import a single PGN instead.');
      const reader = response.body?.getReader();
      let text = '';
      if (reader) {
        let bytes = 0; const decoder = new TextDecoder();
        try { for (;;) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 4000000) throw new Error('Chess.com archive exceeds the 4 MB response limit. Import a single PGN instead.'); text += decoder.decode(next.value, { stream: true }); } text += decoder.decode(); }
        catch (error) { await reader.cancel().catch(() => {}); throw error; }
        finally { reader.releaseLock(); }
      } else text = await response.text();
      if (new TextEncoder().encode(text).length > 4000000) throw new Error('Chess.com archive exceeds the response limit.');
      let data; try { data = JSON.parse(text); } catch { throw new Error('Chess.com returned malformed or truncated JSON. Existing games were not replaced.'); }
      if (cache.size > 36) cache.delete(cache.keys().next().value);
      cache.set(path, { data, time: Date.now() });
      return data;
    } catch (reason) {
      if (signal?.aborted) throw cancelled();
      if (reason.name === 'AbortError') throw new Error('Chess.com took too long to respond. Try again or import the PGN.');
      if (reason instanceof TypeError) throw new Error('Could not reach Chess.com. Check your connection or import a downloaded PGN.');
      throw reason;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  });
  requests = task; return task;
}

export async function getArchives(username, signal) {
  const name = normalizeUsername(username);
  const data = await publicJson(`/pub/player/${name}/games/archives`, signal);
  if (!Array.isArray(data.archives)) throw new Error('Chess.com returned an unreadable archive list.');
  const archives = data.archives.flatMap(value => {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\/pub\/player\/([^/]+)\/games\/(\d{4})\/(\d{2})$/);
      return url.origin === API && match && match[1].toLowerCase() === name && Number(match[3]) >= 1 && Number(match[3]) <= 12 ? [{ month: `${match[2]}-${match[3]}`, path: url.pathname }] : [];
    } catch { return []; }
  }).sort((a, b) => b.month.localeCompare(a.month));
  if (!archives.length) throw new Error('No completed public games are available for this player.');
  return { username: name, archives };
}

export async function getMonthGames(archive, signal) {
  if (!/^\/pub\/player\/[a-zA-Z0-9_-]+\/games\/\d{4}\/(0[1-9]|1[0-2])$/.test(archive.path)) throw new Error('Invalid archive month.');
  const data = await publicJson(archive.path, signal);
  if (!Array.isArray(data.games)) throw new Error('Chess.com returned an unreadable game archive.');
  return data.games.filter(game => game.rules === 'chess' && typeof game.pgn === 'string' && game.pgn.trim()).sort((a, b) => (b.end_time || 0) - (a.end_time || 0));
}

function matchesGame(game, target) {
  try { const source = parseChessComUrl(game.url); return source.id === target.id && source.type === target.type; } catch { return false; }
}

async function resolveMetadata(target, signal) {
  try {
    const response = await fetch(`/api/chesscom/resolve?url=${encodeURIComponent(target.url)}`, { signal, credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
    return await response.json();
  } catch (reason) { if (signal?.aborted) throw cancelled(); return null; }
}

export async function findGameByUrl({ url, username, month, signal, onProgress }) {
  const target = parseChessComUrl(url);
  onProgress?.('Reading the public game link…');
  const meta = username?.trim() ? null : await resolveMetadata(target, signal);
  const supplied = username?.trim();
  const candidates = [...new Set([supplied, ...(Array.isArray(meta?.usernames) ? meta.usernames : [])].filter(value => typeof value === 'string' && value.trim()))].slice(0, 3);
  const preferred = month || meta?.month;
  let foundAccount = false, remaining = 18;
  // Keep a typo from triggering an unbounded account-history crawl. Older games
  // remain reachable by selecting the known month or a username archive. Reserve
  // search budget for all public-page candidates: an unrelated member link must
  // not prevent the actual players from being checked.
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    const candidate = candidates[candidateIndex];
    let account;
    try { account = await getArchives(candidate, signal); }
    catch (reason) {
      if (signal?.aborted || reason.name === 'AbortError') throw cancelled();
      if (supplied || /rate limiting|Could not reach|HTTP 5|too long/.test(reason.message)) throw reason;
      continue;
    }
    foundAccount = true;
    const ordered = [...account.archives].sort((a, b) => (a.month === b.month ? 0 : preferred && a.month === preferred ? -1 : preferred && b.month === preferred ? 1 : b.month.localeCompare(a.month)));
    const allocation = Math.ceil(remaining / (candidates.length - candidateIndex));
    const limit = month ? ordered.filter(archive => archive.month === month) : ordered.slice(0, allocation);
    if (!limit.length && supplied) throw new Error('This player has no public archive for the selected month. Choose a different month.');
    for (const archive of limit) {
      if (signal?.aborted) throw cancelled();
      onProgress?.(`Looking in ${account.username} · ${archive.month} (${19 - remaining}/18 max)…`);
      const games = await getMonthGames(archive, signal);
      remaining--;
      const match = games.find(game => matchesGame(game, target));
      if (match) return { ...match, importUsername: account.username };
    }
  }
  if (!foundAccount) throw new Error('Chess.com did not expose the players on this link. Add either player’s username below, then search again. No login is needed.');
  throw new Error('This game was not found in the searched public archives. Check the player, choose the game’s month for an older game, or download its PGN. Ongoing, private and variant games are not available.');
}
