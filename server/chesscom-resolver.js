// Local-development helper for public link metadata only. This is not a generic
// proxy: fixed HTTPS host, numeric live/daily game paths, no cookies, no login,
// no internal callback APIs, bounded response size/time, serial cached requests.
const cache = new Map();
let queue = Promise.resolve();

function publicGameUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['www.chess.com', 'chess.com'].includes(url.hostname) || url.port || url.username || url.password) throw new Error('Only public Chess.com game links are accepted.');
  const match = url.pathname.match(/^\/game\/(live|daily)\/(\d{1,20})\/?$/);
  if (!match) throw new Error('A numeric live or daily game ID is required.');
  return `https://www.chess.com/game/${match[1]}/${match[2]}`;
}
const decode = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function loadMetadata(url) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    let current = url, response;
    for (let redirect = 0; redirect < 3; redirect++) {
      response = await fetch(current, { signal: controller.signal, redirect: 'manual', headers: { Accept: 'text/html', 'User-Agent': 'LineaLocalChessAnalyzer/0.2 (public game metadata; no authentication)' } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      current = publicGameUrl(new URL(response.headers.get('location'), current).href);
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return { usernames: [], month: null };
    if (Number(response.headers.get('content-length')) > 2000000) return { usernames: [], month: null };
    let size = 0, html = '';
    const reader = response.body.getReader(), decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2000000) { await reader.cancel(); return { usernames: [], month: null }; }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
    const usernames = new Map();
    const add = (name, priority = 1) => { if (/^[a-zA-Z0-9_-]{2,30}$/.test(name || '')) { const key = name.toLowerCase(); usernames.set(key, Math.max(usernames.get(key) || 0, priority)); } };
    const text = decode(html).replace(/\\"/g, '"');
    for (const match of text.matchAll(/"(whiteUsername|blackUsername|username|White|Black)"\s*:\s*"([a-zA-Z0-9_-]{2,30})"/g)) add(match[2], match[1] === 'username' ? 2 : 4);
    // Public member links are only candidates. The official archive must still
    // contain the exact requested game ID before anything can be imported.
    for (const match of html.matchAll(/href=["'](?:https:\/\/www\.chess\.com)?\/member\/([a-zA-Z0-9_-]{2,30})(?:["'/?#])/g)) add(match[1]);
    const metadata = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => match[0]);
    let month = null;
    for (const tag of metadata) {
      const key = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1];
      const content = decode(tag.match(/content=["']([^"']*)["']/i)?.[1] || '');
      if (key === 'og:title' || key === 'description' || key === 'og:description') {
        const pair = content.match(/\b([a-zA-Z0-9_-]{2,30})\s+(?:vs\.?|versus)\s+([a-zA-Z0-9_-]{2,30})\b/i);
        if (pair) { add(pair[1], 5); add(pair[2], 5); }
      }
      if (key === 'article:published_time' && /^\d{4}-(0[1-9]|1[0-2])-/.test(content)) month = content.slice(0, 7);
    }
    const date = html.match(/"datePublished"\s*:\s*"(\d{4}-(?:0[1-9]|1[0-2]))-\d{2}/)?.[1];
    return { usernames: [...usernames].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name), month: month || date || null };
  } finally { clearTimeout(timer); }
}

// Shared by the local Vite middleware and the hosted Vercel function.
// The request returns its Promise so serverless execution waits for completion.
let pending = 0;
export function handleChessComResolve(req, res) {
  const send = (status, data) => {
    if (res.destroyed) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
  };
  if (req.method !== 'GET') { send(405, { error: 'Only GET is supported.' }); return; }
  let url;
  try { url = publicGameUrl(new URL(req.url, 'http://localhost').searchParams.get('url')); }
  catch { send(400, { error: 'Invalid public game link.' }); return; }
  const saved = cache.get(url);
  if (saved && Date.now() - saved.time < 600000) { send(200, saved.data); return; }
  // A warm serverless instance has a bounded serial queue, not an unlimited backlog.
  if (pending >= 2) { send(429, { error: 'Link lookup busy. Please retry shortly.' }); return; }
  pending++;
  queue = queue.catch(() => {}).then(async () => {
    try {
      const existing = cache.get(url);
      const data = existing && Date.now() - existing.time < 600000 ? existing.data : await loadMetadata(url);
      if (cache.size > 80) cache.delete(cache.keys().next().value);
      cache.set(url, { time: Date.now(), data }); send(200, data);
    } catch { send(200, { usernames: [], month: null }); }
    finally { pending--; }
  });
  return queue;
}

export function chessComResolver() {
  return {
    name: 'linea-public-chesscom-link-resolver',
    configureServer(server) {
      server.middlewares.use('/api/chesscom/resolve', handleChessComResolve);
    },
  };
}
