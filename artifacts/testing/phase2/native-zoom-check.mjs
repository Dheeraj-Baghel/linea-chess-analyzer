// Supplemental native-zoom evidence; run from the app directory. Disposable
// profile/extension only. No user's browser settings or app code are modified.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'linea-phase2-zoom-'));
const extension = path.join(temp, 'extension'); await fs.mkdir(extension);
await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Disposable Linea zoom QA', version: '1.0', permissions: ['tabs'], background: { service_worker: 'background.js' } }));
await fs.writeFile(path.join(extension, 'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
let context;
const record = { checkedAt: new Date().toISOString(), method: 'Native tabs.setZoom(2), not CSS or pinch zoom' };
try {
  context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { channel: 'chromium', headless: true, viewport: null, ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'], args: ['--window-size=1440,900', '--enable-unsafe-extension-debugging', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  const page = context.pages()[0]; await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4325/'); await expect(page.getByRole('gridcell')).toHaveCount(64);
  record.factor = await worker.evaluate(async () => { const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('http://127.0.0.1:4325')); await chrome.tabs.setZoom(tab.id, 2); return chrome.tabs.getZoom(tab.id); });
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
  record.geometry = await page.evaluate(() => ({ innerWidth, innerHeight, outerWidth, devicePixelRatio, page: document.documentElement.scrollWidth, cssZoom: getComputedStyle(document.documentElement).zoom, visualScale: visualViewport.scale }));
  expect(record.geometry.innerWidth).toBe(720); expect(record.geometry.cssZoom).toBe('1'); expect(record.geometry.visualScale).toBe(1); expect(record.geometry.page).toBeLessThanOrEqual(720);
  await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click(); await expect(page.locator('.move-counter strong')).toHaveText('29');
  await page.getByRole('button', { name: 'Engine settings', exact: true }).click();
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]'))).toBe(true); }
  const box = await page.getByRole('dialog').boundingBox(); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(record.geometry.innerHeight);
  await page.getByRole('dialog').evaluate(node => { node.scrollTop = 0; });
  const session = await context.newCDPSession(page); const capture = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await fs.writeFile('artifacts/screenshots/phase2/native-200-percent-engine-drawer.png', Buffer.from(capture.data, 'base64'));
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Engine settings', exact: true })).toBeFocused();
  record.status = 'passed';
} catch (error) { record.status = 'failed'; record.error = error.message; process.exitCode = 1; }
finally { await context?.close(); await fs.rm(temp, { recursive: true, force: true }); }
await fs.writeFile('artifacts/testing/phase2/native-zoom.json', JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
