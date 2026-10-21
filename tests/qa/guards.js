// Phase 0 guards are deliberately independent of the app and browser runner so
// their rejection paths can be unit tested without starting Stockfish.
export function assertLineaDocument(html, { production = false } = {}) {
  if (!/<title>Linea[^<]*<\/title>/.test(html) || !/<div id="root"/.test(html)) {
    throw new Error('QA origin is not the Linea application. Refusing to test another app.');
  }
  if (production && (/\/@vite\/client/.test(html) || !/src="\/assets\/[^\"]+\.js"/.test(html))) {
    throw new Error('Production QA requires the compiled Linea bundle, not the development server.');
  }
}

export function requestPolicy(url, baseURL, { liveProvider = false } = {}) {
  const target = new URL(url);
  if (['data:', 'blob:'].includes(target.protocol)) return 'allow';
  if (target.origin === new URL(baseURL).origin) {
    // The resolver makes server-side network calls. Deterministic tests must
    // intercept it explicitly, just like direct Published Data API requests.
    return target.pathname === '/api/chesscom/resolve' && !liveProvider ? 'deny' : 'allow';
  }
  if (target.origin === 'https://fonts.googleapis.com') return 'font-fallback';
  if (liveProvider && target.origin === 'https://api.chess.com' && target.pathname.startsWith('/pub/')) return 'allow';
  if (liveProvider && target.origin === 'https://lichess.org' && (/^\/game\/export\/[a-zA-Z0-9]{8}$/.test(target.pathname) || /^\/api\/games\/user\/[a-zA-Z0-9_-]{2,30}$/.test(target.pathname))) return 'allow';
  return 'deny';
}
