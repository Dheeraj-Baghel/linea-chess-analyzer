// Run from the Linea app directory, separately from the default QA gate.
// An ephemeral test-profile-only extension calls Chromium's native zoom API.
// No user profile, app source, CSS zoom, pinch scale or browser preference is changed.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'linea-native-zoom-'));
const extension = path.join(temporary, 'extension');
await fs.mkdir(extension);
await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Disposable Linea zoom QA', version: '1.0', permissions: ['tabs'], background: { service_worker: 'background.js' } }));
await fs.writeFile(path.join(extension, 'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
let context;
const record = { checkedAt: new Date().toISOString(), mechanism: 'chrome.tabs.setZoom(2), disposable Chromium test profile', checks: [] };
try {
  context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    channel: 'chromium', headless: true, viewport: null,
    ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'],
    args: ['--window-size=1440,900', '--enable-unsafe-extension-debugging', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '/* isolated system-font fallback */' }));
  const page = context.pages()[0];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4325/');
  await expect(page).toHaveTitle(/^Linea/);
  await expect(page.getByRole('gridcell')).toHaveCount(64);
  record.nativeZoom = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(tab => tab.url?.startsWith('http://127.0.0.1:4325'));
    await chrome.tabs.setZoom(tab.id, 2);
    return { factor: await chrome.tabs.getZoom(tab.id), settings: await chrome.tabs.getZoomSettings(tab.id) };
  });
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
  record.geometry = await page.evaluate(() => ({ innerWidth, innerHeight, outerWidth, outerHeight, devicePixelRatio, cssZoom: getComputedStyle(document.documentElement).zoom, visualScale: visualViewport.scale, pageWidth: document.documentElement.scrollWidth }));
  expect(record.geometry.innerWidth / record.geometry.outerWidth).toBeCloseTo(.5, 1);
  expect(record.geometry.cssZoom).toBe('1'); expect(record.geometry.visualScale).toBe(1);
  expect(record.geometry.pageWidth).toBeLessThanOrEqual(record.geometry.innerWidth);
  await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click();
  await expect(page.locator('.move-counter strong')).toHaveText('29');
  const cdp = await context.newCDPSession(page);
  const capture = async name => {
    // Native browser zoom needs an unclipped device-pixel capture. A Playwright
    // CSS-viewport clip crops this case; settled reduced motion prevents fades.
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    await fs.writeFile(`artifacts/screenshots/phase1/${name}.png`, Buffer.from(data, 'base64'));
  };
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture('native-200-percent-zoom');
  await page.getByRole('button', { name: 'Display settings', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('animation-name', 'none');
  await expect(dialog).toHaveCSS('opacity', '1');
  await dialog.getByRole('button', { name: 'Walnut', exact: true }).click();
  for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]'))).toBe(true); }
  const box = await dialog.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(record.geometry.innerHeight);
  await dialog.evaluate(node => { node.scrollTop = 0; });
  await capture('native-200-percent-dialog');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Display settings', exact: true })).toBeFocused();
  await expect(page.locator('.chessboard')).toHaveClass(/theme-walnut/);
  record.checks = ['Native API zoom factor 2 and 720 CSS pixels in a 1440-pixel window', 'No CSS/pinch zoom, no horizontal overflow', 'Board transport and scrollable keyboard settings work at native 200%', 'Settled, unclipped device-pixel viewport screenshots'];
  record.status = 'passed';
} catch (error) { record.status = 'failed'; record.error = error.message; process.exitCode = 1; }
finally { await context?.close(); await fs.rm(temporary, { recursive: true, force: true }); }
await fs.writeFile('artifacts/testing/phase1/native-browser-zoom.json', JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
