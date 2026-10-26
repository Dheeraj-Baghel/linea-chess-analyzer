// Hosted Linea verification: real public HTTPS, native Stockfish, native storage.
// No engine responses, saved reviews or provider responses are injected.
// Run LINEA_HOSTED_URL=https://linea-chess-analyzer.vercel.app node scripts/verify-hosted.mjs
import { chromium, devices } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ENGINE_BUILD } from '../src/engineBuild.js';
import { matePgn, shortPgn, guidedReview, originalPgn, currentFen, clickMove, square, counter } from '../tests/browser/helpers.js';

const base = process.env.LINEA_HOSTED_URL || 'https://linea-chess-analyzer.vercel.app';
const output = 'artifacts/testing/vercel';
await fs.mkdir(output, { recursive: true });
const checks = [], errors = [], failures = [], responses = [], cancelledMedia = [];
const record = name => { checks.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); };
const browser = await chromium.launch({ headless: true });
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => {
    if (!request.url().startsWith(base)) return;
    const detail = { url: request.url(), error: request.failure()?.errorText || 'unknown' };
    // Chromium cancels lazy video range downloads when sources reload/navigation
    // leaves the page. Exempt only explicit cancellation, not HTTP/decoder errors.
    if (detail.error === 'net::ERR_ABORTED' && /\/previews\/[^/]+\.(webm|mp4)$/.test(new URL(detail.url).pathname)) cancelledMedia.push(detail);
    else failures.push(detail);
  });
  page.on('response', response => { if (response.url().startsWith(base)) { responses.push({ url: response.url(), status: response.status() }); if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); } });
}
async function load(page, pgn) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Review my game', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'PGN game', exact: true }).first().click();
  await dialog.locator('#import-text').fill(pgn);
  await dialog.getByRole('combobox', { name: 'PGN player to focus on' }).selectOption('w');
  await dialog.getByRole('button', { name: 'Load game', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await guidedReview(page);
}
async function saved(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('linea-library'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = db.transaction('reviews').objectStore('reviews').getAll(); request.onsuccess = () => resolve(request.result.map(row => row.snapshot)); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  });
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage(); observe(page);
  const home = await page.goto('/');
  assert.equal(home.status(), 200); await expect(page).toHaveTitle(/^Linea/);
  await expect(page.getByRole('button', { name: 'Review my game', exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${output}/hosted-home-desktop.png`, fullPage: true });
  record('anonymous public HTTPS homepage and import controls');
  for (const [key, value] of Object.entries({ 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' })) assert.equal(home.headers()[key], value);
  record('production security headers');
  // All locally built public bytes except the version manifest, which excludes
  // OS metadata on Vercel, and the non-publishable .DS_Store itself.
  async function walk(dir) {
    const files = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...await walk(file));
      else if (entry.name !== '.DS_Store' && entry.name !== 'linea-offline-version.js') files.push(file);
    }
    return files;
  }
  const files = await walk('dist');
  for (const file of files) {
    const url = '/' + path.relative('dist', file).split(path.sep).join('/');
    const response = await context.request.get(base + url);
    assert.equal(response.status(), 200, url);
    assert.equal(sha(await response.body()), sha(await fs.readFile(file)), `byte equality: ${url}`);
  }
  record(`all ${files.length} shipped app, model, demo, piece and engine files match local production bytes`);
  for (const [url, expected] of [[ENGINE_BUILD.workerUrl, ENGINE_BUILD.workerSha256], [ENGINE_BUILD.wasmUrl, ENGINE_BUILD.wasmSha256]]) {
    const response = await context.request.get(base + url);
    assert.equal(sha(await response.body()), expected);
    if (url.endsWith('.wasm')) assert.match(response.headers()['content-type'], /application\/wasm/);
  }
  record('pinned Stockfish worker/WASM hashes and correct WASM MIME');
  for (const route of ['/.env', '/.env.local', '/.git/config', '/src/App.jsx', '/artifacts/testing/unit-results.json', '/assets/missing.js', '/api/not-a-function']) {
    const response = await context.request.get(base + route);
    assert.equal(response.status(), 404, `non-public path ${route}`);
  }
  for (const url of ['http://127.0.0.1/secret', 'https://chess.com.evil.test/game/live/1', 'https://user:pass@www.chess.com/game/live/1', 'https://www.chess.com/callback/live/game/1']) {
    const response = await context.request.get(base + '/api/chesscom/resolve?url=' + encodeURIComponent(url));
    assert.equal(response.status(), 400); assert.match(response.headers()['content-type'], /application\/json/);
  }
  const badMethod = await context.request.post(base + '/api/chesscom/resolve');
  assert.equal(badMethod.status(), 405);
  record('private/source/missing paths are 404; hosted API denies unsafe targets and non-GET');
  const sample = await page.goto('/sample'); assert.equal(sample.status(), 200);
  await expect(page.getByRole('gridcell')).toHaveCount(64);
  await page.reload(); await expect(page.getByRole('gridcell')).toHaveCount(64);
  record('extensionless SPA sample route and direct reload');
  await load(page, matePgn);
  await expect.poll(async () => (await saved(page)).some(review => review?.generation.status === 'completed'), { timeout: 60000 }).toBe(true);
  const reviews = await saved(page), completed = reviews.find(review => review?.generation.status === 'completed');
  assert.equal(completed.done, 4); assert.equal(Object.keys(completed.records).length, 4);
  assert.ok(Object.values(completed.records).every(move => move.provenance));
  assert.equal(await originalPgn(page), matePgn);
  await fs.writeFile(`${output}/hosted-native-review.json`, JSON.stringify(completed, null, 2));
  record('real hosted Stockfish computes a four-ply review with persisted native evidence');
  await page.getByRole('button', { name: /^Go to 1… e5(,|$)/ }).click();
  const fen = await currentFen(page);
  await clickMove(page, 'g2', 'g3');
  const card = page.getByRole('region', { name: 'Live variation move review' });
  await expect(card).toHaveAttribute('data-review-status', 'complete', { timeout: 40000 });
  await expect(card.locator('[data-feedback-type]')).toBeVisible();
  assert.equal(await originalPgn(page), matePgn);
  await page.getByRole('button', { name: 'Return to game', exact: true }).click();
  assert.equal(await currentFen(page), fen); await expect(counter(page)).toHaveText('2');
  record('legal alternate move receives native feedback; Return restores exact original PGN/position');
  const route = page.url(); await page.reload();
  await expect(page.getByRole('gridcell')).toHaveCount(64);
  assert.equal(page.url(), route); assert.equal(await originalPgn(page), matePgn);
  const restored = (await saved(page)).find(review => review?.generation.status === 'completed');
  assert.deepEqual(restored.records, completed.records);
  record('hosted game route and completed review survive a native browser reload');
  await page.screenshot({ path: `${output}/hosted-review-desktop.png`, fullPage: true });
  // Sources are lazy/intersection-loaded, and reduced-motion intentionally shows posters.
  // Exercise the normal-motion path with each clip visibly onscreen, not hidden preload.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const videos = page.locator('video'); assert.ok(await videos.count() >= 4);
  for (let index = 0; index < 4; index++) {
    const video = videos.nth(index); await video.scrollIntoViewIfNeeded();
    await expect.poll(() => video.evaluate(element => element.readyState >= 2 && Number.isFinite(element.duration) && element.duration > 0), { timeout: 20000 }).toBe(true);
    await expect.poll(() => video.evaluate(element => !element.paused), { timeout: 10000 }).toBe(true);
  }
  record('all four visible hosted homepage demo videos decode and play');
  const mobileContext = await browser.newContext({ ...devices['iPhone 13'], baseURL: base, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const mobile = await mobileContext.newPage(); observe(mobile); await mobile.goto('/');
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: `${output}/hosted-home-mobile.png`, fullPage: true });
  await load(mobile, shortPgn);
  await expect(mobile.getByRole('gridcell')).toHaveCount(64);
  await expect(counter(mobile)).toHaveText('0');
  await square(mobile, 'd2').tap(); await square(mobile, 'd4').tap();
  await expect(mobile.getByRole('region', { name: 'Variation move feedback' })).toBeVisible();
  // User-selected placement: Return is in the review panel, never under the board.
  const mobileViews = mobile.getByRole('navigation', { name: 'Analysis workspace views' });
  await mobileViews.getByRole('button', { name: 'Review', exact: true }).tap();
  await expect(mobile.getByRole('button', { name: 'Return to game', exact: true })).toBeVisible();
  await mobile.getByRole('button', { name: 'Return to game', exact: true }).tap();
  await mobileViews.getByRole('button', { name: 'Board', exact: true }).tap();
  await expect(counter(mobile)).toHaveText('0');
  const bounds = await mobile.locator('.chessboard').boundingBox(); assert.ok(Math.abs(bounds.width - bounds.height) < 1);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: `${output}/hosted-review-mobile.png`, fullPage: true });
  record('emulated-phone homepage, real PGN import/tap moves/return, square board and no overflow');
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  record('no browser errors or unexpected failed application requests (explicit cancelled video ranges recorded separately)');
} finally {
  await browser.close();
  await fs.writeFile(`${output}/hosted-results.json`, JSON.stringify({ base, verifiedAt: new Date().toISOString(), checks, errors, failures, responses, cancelledMedia, limits: 'Chromium and emulated phone; no physical devices. Provider imports are not mocked or exercised. Browser reviews are temporary synthetic studies.' }, null, 2));
}
console.log(`${checks.length}/${checks.length} hosted checks passed.`);
