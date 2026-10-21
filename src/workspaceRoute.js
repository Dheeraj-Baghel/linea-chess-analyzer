// A small native-history boundary for the incremental product rollout. Game IDs
// are opaque and encoded; provider links are import inputs, never navigation URLs.
export function readWorkspaceRoute(location = window.location) {
  const query = new URLSearchParams(location.search);
  const games = location.pathname.match(/^\/games\/(chesscom|lichess)\/([^/]+)\/?$/), report = location.pathname.match(/^\/player-report\/([^/]+)\/?$/);
  try {
    if (games) return { kind: 'games', provider: games[1], username: decodeURIComponent(games[2]), key: null, ply: null, view: 'moves' };
    if (report) return { kind: 'player-report', key: decodeURIComponent(report[1]), ply: null, view: 'report' };
  } catch { return { kind: 'missing', key: null, ply: null, view: 'moves' }; }
  const match = location.pathname.match(/^\/review\/([^/]+)\/?$/);
  let key = null;
  try { key = match ? decodeURIComponent(match[1]) : null; } catch { /* Invalid URL remains an explicit missing route. */ }
  const raw = query.get('ply'), ply = raw !== null && /^\d+$/.test(raw) ? Math.min(100000, Number(raw)) : null;
  return { kind: match ? key ? 'review' : 'missing' : location.pathname === '/sample' ? 'sample' : location.pathname === '/library' ? 'library' : location.pathname === '/' ? 'root' : 'missing', key, ply, view: ['report', 'guided'].includes(query.get('view')) ? query.get('view') : 'moves' };
}
export function workspaceUrl(key, ply = 0, view = 'moves') {
  return `/review/${encodeURIComponent(key)}?${new URLSearchParams({ ply: String(Math.max(0, Math.floor(ply))), view: ['report', 'guided'].includes(view) ? view : 'moves' })}`;
}
export function writeWorkspaceRoute(url, { replace = false } = {}) {
  if (!url.startsWith('/') || url.startsWith('//')) throw new Error('Only local Linea routes are supported.');
  if (url === window.location.pathname + window.location.search) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
}
