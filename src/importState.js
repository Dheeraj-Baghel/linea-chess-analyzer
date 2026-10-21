import { findGameByUrl, getArchives, getMonthGames, normalizeUsername, parseChessComUrl } from './chesscom.js';

// Phase 2: a single session owner outlives rail/dialog/drawer presentations.
// Changing a tab, closing a presentation or resizing never starts/aborts a task.
// Only explicit searches, Cancel, successful import/reset or disposal invalidate it.
export const monthLabel = month => new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

export function chessComRow(game, account = '') {
  const identity = parseChessComUrl(game.url);
  const draws = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'];
  const username = (game.importUsername || account).trim().replace(/^@/, '').toLowerCase();
  const color = game.black?.username?.toLowerCase() === username ? 'b' : game.white?.username?.toLowerCase() === username ? 'w' : null;
  return {
    key: `chess.com:${identity.type}:${identity.id}`, provider: 'chess.com', id: identity.id,
    url: identity.url, pgn: game.pgn, username, color,
    white: { name: game.white?.username || 'White', rating: game.white?.rating ?? null },
    black: { name: game.black?.username || 'Black', rating: game.black?.rating ?? null },
    result: game.white?.result === 'win' ? '1–0' : game.black?.result === 'win' ? '0–1' : draws.includes(game.white?.result) ? '½–½' : 'Finished',
    format: game.time_class || 'unknown', timeControl: game.time_control || 'Not supplied',
    date: game.end_time ? new Date(game.end_time * 1000).toISOString() : null, rated: Boolean(game.rated),
  };
}

export const chessComAdapter = {
  async search(draft, { signal, progress }) {
    if (draft.mode === 'url') {
      const game = await findGameByUrl({ url: draft.url, username: draft.username, month: draft.linkMonth, signal, onProgress: progress });
      return { account: { username: game.importUsername || draft.username, archives: [] }, games: [chessComRow(game, draft.username)], month: '', hasMore: false };
    }
    const account = await getArchives(normalizeUsername(draft.username), signal);
    const month = account.archives[0].month;
    progress(`Loading ${monthLabel(month)}…`);
    const games = await getMonthGames(account.archives[0], signal);
    return { account, month, games: games.map(game => chessComRow(game, account.username)), hasMore: false };
  },
  async month(state, month, { signal, progress }) {
    const archive = state.account?.archives.find(item => item.month === month);
    if (!archive) throw new Error('Choose an available archive month.');
    progress(`Loading ${monthLabel(month)}…`);
    const games = await getMonthGames(archive, signal);
    return { games: games.map(game => chessComRow(game, state.account.username)), month };
  },
};

const providerState = () => ({ mode: 'username', username: '', url: '', linkMonth: '', account: null, month: '', games: [], filter: 'all', limit: 20, busy: false, message: '', error: '', hasMore: false, cursor: null });
export function createImportStore(adapters = { chesscom: chessComAdapter }) {
  let state = { tab: 'chesscom', productSource: 'chesscom', productUsername: '', pgn: '', fen: '', focusColor: '', textErrors: { pgn: '', fen: '' }, providers: Object.fromEntries(Object.keys(adapters).map(key => [key, providerState()])), loadedKey: null };
  let disposed = false, fileGeneration = 0;
  const listeners = new Set(), tasks = new Map();
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; for (const listener of listeners) listener(); } };
  const patchProvider = (name, patch) => emit({ providers: { ...state.providers, [name]: { ...state.providers[name], ...patch } } });
  const cancel = name => {
    const task = tasks.get(name); tasks.delete(name); task?.controller.abort();
    patchProvider(name, { busy: false, message: '' });
  };
  const run = async (name, action) => {
    cancel(name);
    const task = { controller: new AbortController() }; tasks.set(name, task);
    const current = () => !disposed && tasks.get(name) === task && !task.controller.signal.aborted;
    patchProvider(name, { busy: true, error: '', message: 'Connecting to public games…' });
    try {
      const result = await action({ signal: task.controller.signal, progress: message => { if (current()) patchProvider(name, { message }); } });
      if (current()) patchProvider(name, result);
    } catch (error) {
      if (current() && error.name !== 'AbortError') patchProvider(name, { error: error.message || 'Import failed. Try its PGN instead.' });
    } finally { if (current()) { tasks.delete(name); patchProvider(name, { busy: false, message: '' }); } }
  };
  return {
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    setTab: tab => emit({ tab }),
    setFocusColor: color => emit({ focusColor: ['w', 'b'].includes(color) ? color : '' }),
    setProductDraft: patch => emit(patch),
    setText: (kind, value) => emit({ [kind]: value, textErrors: { ...state.textErrors, [kind]: '' } }),
    setTextError: (kind, error) => emit({ textErrors: { ...state.textErrors, [kind]: error } }),
    async readPgnFile(file) {
      const generation = ++fileGeneration;
      if (file.size > 2000000) { this.setTextError('pgn', 'Please use a file under 2 MB.'); return; }
      try {
        const value = await file.text();
        if (disposed || generation !== fileGeneration) return;
        if (value.length > 2000000) throw new Error('Please use a file under 2 MB.');
        this.setText('pgn', value);
      } catch (error) { if (!disposed && generation === fileGeneration) this.setTextError('pgn', error.message || 'The file could not be read.'); }
    },
    patchProvider,
    cancel,
    cancelAll() { for (const name of Object.keys(state.providers)) cancel(name); },
    markLoaded(key) { fileGeneration++; this.cancelAll(); emit({ loadedKey: key }); },
    resetLoaded() { fileGeneration++; this.cancelAll(); emit({ loadedKey: null }); },
    search(name) {
      const draft = { ...state.providers[name] };
      patchProvider(name, { games: [], account: null, limit: 20, cursor: null, hasMore: false });
      return run(name, task => adapters[name].search(draft, task));
    },
    changeMonth(name, month) {
      const source = state.providers[name];
      patchProvider(name, { month, games: [], limit: 20 });
      return run(name, task => adapters[name].month(source, month, task));
    },
    loadMore(name) {
      const source = state.providers[name];
      if (!source.hasMore || source.busy || !adapters[name].more) return Promise.resolve();
      return run(name, async task => {
        const result = await adapters[name].more(source, task);
        const games = [...new Map([...source.games, ...result.games].map(game => [game.key, game])).values()];
        return { ...result, games, limit: source.limit + 20 };
      });
    },
    dispose() { this.cancelAll(); disposed = true; listeners.clear(); },
  };
}
