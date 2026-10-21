import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { matePgn, importText, counter, guidedReview, advancedReview } from '../browser/helpers.js';

test('production saved review reloads fully offline with pinned cached app and engine', async ({ page, context }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript(() => { const Native = window.Worker; window.__offlineWorkers = 0; window.Worker = class extends Native { constructor(...args) { super(...args); window.__offlineWorkers++; } }; });
  await page.goto('/sample'); await expect(page.getByRole('gridcell')).toHaveCount(64);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const manifest = await page.evaluate(async () => {
    const cachesList = (await caches.keys()).filter(name => name.startsWith('linea-offline-'));
    const cache = await caches.open(cachesList[0]); return { name: cachesList[0], paths: (await cache.keys()).map(request => new URL(request.url).pathname) };
  });
  expect(manifest.paths).toContain('/index.html'); expect(manifest.paths).toContain('/engine/stockfish-19-lite-single.wasm');
  await importText(page, matePgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await guidedReview(page); await page.locator('.chart-point').last().click();
  await page.getByRole('button', { name: 'Recent local games', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveText(/ready to reopen offline/);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => { const request = indexedDB.open('linea-library'); return new Promise(resolve => { request.onsuccess = () => { const db = request.result, tx = db.transaction('reviews'); const rows = tx.objectStore('reviews').getAll(); tx.oncomplete = () => { resolve(rows.result.some(row => row.snapshot.generation.status === 'completed')); db.close(); }; }; }); })).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(page.getByText('Compatible saved evidence restored without recomputation.', { exact: true })).toBeVisible();
  await expect(counter(page)).toHaveText('4'); await expect(page.getByRole('region', { name: 'Guided game review' })).toBeVisible();
  expect(await page.evaluate(() => window.__offlineWorkers)).toBe(0);
  // Explicit live search also starts offline from the exact cached worker/WASM.
  await page.getByRole('button', { name: 'Go to start', exact: true }).click(); await advancedReview(page); await page.getByRole('button', { name: 'Resume position analysis', exact: true }).click();
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  expect(await page.evaluate(() => window.__offlineWorkers)).toBe(1);
  await fs.mkdir('artifacts/testing/product-evolution/final', { recursive: true });
  await fs.writeFile('artifacts/testing/product-evolution/final/offline-cache.json', JSON.stringify({ manifest, savedReviewReload: true, recomputationWorkers: 0, explicitOfflinePositionWorker: 1 }, null, 2));
  await page.screenshot({ path: 'artifacts/testing/product-evolution/final/offline-review.png', fullPage: true });
});
