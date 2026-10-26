// Native hosted offline recovery check; imports a synthetic PGN through the UI.
// Restoration may update wrapper timestamps/ids; immutable accepted evidence
// must remain byte-identical. No engine responses or browser stores are injected.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { matePgn, guidedReview, originalPgn } from '../tests/browser/helpers.js';
const base = process.env.LINEA_HOSTED_URL || 'https://linea-chess-analyzer.vercel.app';
const output = 'artifacts/testing/vercel';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ baseURL: base, reducedMotion: 'reduce', serviceWorkers: 'allow', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Review my game', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'PGN game', exact: true }).first().click();
  await dialog.locator('#import-text').fill(matePgn);
  await dialog.getByRole('combobox', { name: 'PGN player to focus on' }).selectOption('w');
  await dialog.getByRole('button', { name: 'Load game', exact: true }).click();
  await expect(dialog).not.toBeVisible(); await guidedReview(page);
  const reviews = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('linea-library'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = db.transaction('reviews').objectStore('reviews').getAll(); request.onsuccess = () => resolve(request.result.map(row => row.snapshot)); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  });
  await expect.poll(async () => (await reviews()).some(review => review.generation.status === 'completed'), { timeout: 60000 }).toBe(true);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 60000 });
  const before = (await reviews()).find(review => review.generation.status === 'completed');
  const route = page.url();
  const cache = await page.evaluate(async () => ({ names: await caches.keys(), controlled: Boolean(navigator.serviceWorker.controller) }));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('gridcell')).toHaveCount(64);
  assert.equal(page.url(), route); assert.equal(await originalPgn(page), matePgn);
  const after = (await reviews()).find(review => review.generation.status === 'completed');
  const evidence = review => ({ records: review.records, positions: review.positions, rechecks: review.rechecks, acceptances: review.acceptances, done: review.done, total: review.total, quality: review.selectedQuality, generation: review.generation.id, signature: review.generation.game.signature, policy: review.generation.policy, status: review.generation.status });
  const hash = review => createHash('sha256').update(JSON.stringify(evidence(review))).digest('hex');
  assert.equal(hash(after), hash(before), 'accepted evidence survives offline reload exactly');
  await page.screenshot({ path: `${output}/hosted-offline-review.png`, fullPage: true });
  await writeFile(`${output}/hosted-offline-results.json`, JSON.stringify({ url: base, status: 'PASS', cache, route, evidenceSha256: hash(after), checks: ['Native service worker installed and controlled app', 'Real hosted Stockfish review completed', 'Offline direct game reload renders 64 squares', 'Original PGN and immutable accepted review evidence unchanged'], limits: 'Chromium only; external Google Fonts may fail offline and use system fallback. Restoration metadata may update.' }, null, 2));
  console.log('PASS hosted native service-worker install + completed review offline reload; exact PGN/evidence preserved');
  console.log(JSON.stringify(cache));
} finally { await browser.close(); }
