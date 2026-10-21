import { parseGame } from './chess.js';
import { getArchives, getMonthGames, normalizeUsername } from './chesscom.js';
import { chessComRow } from './importState.js';
import { createLichessClient, normalizeLichessUsername } from './lichess.js';

export const SUPPORTED_FORMATS = ['rapid', 'blitz', 'bullet'];
export const MAX_ANALYSIS_GAMES = 10;
export const MAX_BROWSE_GAMES = 30;
export function eligibleBrowserRow(row, filter = 'all') {
  if (!SUPPORTED_FORMATS.includes(row.format) || filter !== 'all' && row.format !== filter || !['w', 'b'].includes(row.color) || typeof row.pgn !== 'string' || row.pgn.length > 2000000) return false;
  try { const game = parseGame(row.pgn); return game.moves.length > 0 && ['1-0', '0-1', '1/2-1/2'].includes(game.headers.Result) && (!game.headers.Variant || /^(standard|chess)$/i.test(game.headers.Variant)); } catch { return false; }
}
const emptyBucket = () => ({ rows: [], cursor: null, monthIndex: 0, hasMore: true, selected: [], limit: 10 });

// Provider page sizes are independent of displayed/selected sample sizes.
// One generation owns each async search; failed or late requests never replace
// the board. Persist browse state only in this browser, not an account login.
export function createGameBrowser({ library, archives = getArchives, month = getMonthGames, lichess = createLichessClient(), now = () => Date.now(), pageLimit = 6, timeLimitMs = 90000 } = {}) {
  let state = { provider: 'chesscom', username: '', filter: 'all', rows: [], selected: [], limit: 10, busy: false, error: '', notice: '', hasMore: true, account: null, fetchedAt: null };
  let account = null, task = null, disposed = false, generation = 0;
  const listeners = new Set();
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; for (const listener of listeners) listener(); } };
  const cancel = () => { generation++; task?.abort(); task = null; emit({ busy: false }); };
  const persist = async () => {
    if (!library || !account) return;
    try { await library.put('accounts', structuredClone(account)); } catch { emit({ notice: 'Browse state could not be saved. Current results are still usable.' }); }
  };
  const load = async target => {
    cancel(); const token = generation, controller = new AbortController(); task = controller;
    const owner = account, filter = state.filter;
    const bucket = structuredClone(owner.filters[filter] || emptyBucket()); bucket.limit = Math.min(MAX_BROWSE_GAMES, target);
    const active = () => !disposed && generation === token && account === owner && !controller.signal.aborted;
    emit({ busy: true, error: '', notice: 'Loading eligible public games…', limit: bucket.limit });
    const began = now(); let pages = 0, error = '', omitted = 0;
    try {
      if (owner.provider === 'chesscom' && !owner.archives) {
        const result = await archives(owner.username, controller.signal); if (!active()) return;
        owner.archives = result.archives;
      }
      while (bucket.rows.length < target && bucket.hasMore && pages < pageLimit && now() - began < timeLimitMs) {
        if (!active()) return;
        let rows;
        if (owner.provider === 'chesscom') {
          const archive = owner.archives[bucket.monthIndex];
          if (!archive) { bucket.hasMore = false; break; }
          emit({ notice: `Checking ${archive.month} · ${bucket.rows.length} eligible games found…` });
          let cached = owner.months[archive.month];
          if (!cached || bucket.monthIndex === 0 && now() - cached.fetchedAt > 120000) {
            const games = await month(archive, controller.signal); if (!active()) return;
            cached = { fetchedAt: now(), rows: games.map(game => { try { return chessComRow(game, owner.username); } catch { return null; } }).filter(Boolean) };
            owner.months[archive.month] = cached;
          }
          rows = cached.rows; bucket.monthIndex++; bucket.hasMore = bucket.monthIndex < owner.archives.length;
        } else {
          const result = await lichess.history(owner.username, { until: bucket.cursor, format: filter, signal: controller.signal }); if (!active()) return;
          rows = result.games; bucket.cursor = result.cursor; bucket.hasMore = result.hasMore;
          if (result.notice) emit({ notice: result.notice });
        }
        pages++;
        const seen = new Map(bucket.rows.map(row => [row.key, row]));
        for (const row of rows) {
          if (!eligibleBrowserRow(row, filter)) { omitted++; continue; }
          if (seen.has(row.key) && seen.get(row.key).pgn !== row.pgn) throw new Error('Conflicting PGNs were returned for one game ID. Existing results were preserved.');
          seen.set(row.key, row);
        }
        bucket.rows = [...seen.values()].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)).slice(0, MAX_BROWSE_GAMES);
        if (active()) emit({ rows: bucket.rows.slice(0, bucket.limit), hasMore: bucket.hasMore || bucket.rows.length > bucket.limit });
      }
    } catch (reason) { if (!active()) return; if (reason.name !== 'AbortError') error = reason.message || 'History request failed. Retry or import PGN.'; }
    if (!active()) return;
    const boundary = bucket.rows.length < target && bucket.hasMore;
    owner.filters[filter] = bucket; owner.filter = filter; owner.fetchedAt = new Date(now()).toISOString();
    const available = bucket.rows.slice(0, bucket.limit);
    bucket.selected = bucket.selected.filter(key => available.some(row => row.key === key));
    emit({ busy: false, rows: available, selected: [...bucket.selected], limit: bucket.limit, error, hasMore: available.length < MAX_BROWSE_GAMES && (bucket.hasMore || bucket.rows.length > bucket.limit), account: { provider: owner.provider, username: owner.username }, fetchedAt: owner.fetchedAt, notice: boundary ? `Search boundary reached after ${pages} pages. Continue search to look for more; ${available.length} eligible games found.` : !available.length ? 'No eligible completed Rapid, Blitz or Bullet games were found.' : `${available.length} eligible games loaded${!bucket.hasMore && available.length < target ? ' · end of available history' : ''}${omitted ? ` · ${omitted} unsupported or unreadable entries omitted` : ''}.` });
    await persist();
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    cancel,
    async search(provider, value, { restore = false } = {}) {
      cancel(); const token = generation;
      try {
        const username = provider === 'chesscom' ? normalizeUsername(value) : normalizeLichessUsername(value);
        if (!['chesscom', 'lichess'].includes(provider)) throw new Error('Choose Chess.com or Lichess.');
        let saved = null;
        if (restore && library) saved = await library.read('accounts', `${provider}:${username}`);
        if (generation !== token) return;
        account = saved || { key: `${provider}:${username}`, provider, username, filter: 'all', filters: {}, months: {}, archives: null };
        const filter = account.filter || 'all', bucket = account.filters[filter] || emptyBucket();
        emit({ provider, username, filter, rows: bucket.rows.slice(0, bucket.limit), selected: bucket.selected, limit: bucket.limit, error: '', notice: '', account: { provider, username }, hasMore: bucket.hasMore });
        if (!saved) await load(10); else emit({ notice: 'Saved browse state restored. Refresh history to check for newer games.', fetchedAt: account.fetchedAt });
      } catch (error) { if (generation === token) emit({ busy: false, error: error.message }); }
    },
    async filter(value) {
      if (!['all', ...SUPPORTED_FORMATS].includes(value) || !account) return;
      cancel(); const bucket = account.filters[value] || emptyBucket();
      emit({ filter: value, rows: bucket.rows.slice(0, bucket.limit), selected: bucket.selected, limit: bucket.limit, error: '' });
      await load(bucket.limit);
    },
    more: () => account ? load(Math.min(MAX_BROWSE_GAMES, Math.max(10, state.limit + 10))) : Promise.resolve(),
    continue: () => account ? load(state.limit) : Promise.resolve(),
    refresh: () => account ? (account.filters = {}, account.months = {}, account.archives = null, load(10)) : Promise.resolve(),
    select(key) {
      if (!state.rows.some(row => row.key === key)) return;
      const selected = state.selected.includes(key) ? state.selected.filter(value => value !== key) : [...state.selected, key];
      if (selected.length > MAX_ANALYSIS_GAMES) { emit({ error: 'Select at most 10 games for one analysis.' }); return; }
      account.filters[state.filter] = { ...(account.filters[state.filter] || emptyBucket()), selected };
      emit({ selected, error: '' }); persist();
    },
    sample() { const rows = state.selected.length ? state.rows.filter(row => state.selected.includes(row.key)) : state.rows.slice(0, MAX_ANALYSIS_GAMES); return structuredClone({ provider: state.provider, username: state.username, filter: state.filter, fetchedAt: state.fetchedAt, games: rows.slice(0, MAX_ANALYSIS_GAMES) }); },
    clear() { cancel(); account = null; emit({ rows: [], selected: [], account: null, username: '', fetchedAt: null, notice: '', error: '' }); },
    dispose() { cancel(); disposed = true; listeners.clear(); },
  };
}
