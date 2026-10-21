// Supplemental verification of the compiled report and real browser zoom.
// Run from the app directory. No real user profile or saved game is modified.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const game = '[Event "Phase 4 verification fixture"]\n[White "Fixture White"]\n[Black "Fixture Black"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
const output = 'artifacts/testing/phase4', images = 'artifacts/screenshots/phase4';
const results = { checkedAt: new Date().toISOString(), compiled: {}, nativeZoom: {} };
async function importGame(page) {
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'PGN game', exact: true }).click();
  await dialog.locator('#import-text').fill(game); await dialog.getByRole('button', { name: 'Load game', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
let browser, zoomContext, temporary;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.goto('http://127.0.0.1:4335/'); await expect(page).toHaveTitle(/^Linea/);
  await page.getByRole('button', { name: 'Pause position analysis', exact: true }).click();
  await importGame(page); await page.getByRole('tab', { name: 'Report', exact: true }).click();
  await page.getByRole('combobox', { name: 'Game review quality', exact: true }).selectOption('quick');
  await page.locator('.review-quality').getByRole('button', { name: 'Review this game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 30000 });
  const generation = await page.locator('.review-provenance').getAttribute('data-generation-id');
  await expect(page.locator('.review-provenance')).toHaveAttribute('data-policy', 'quick');
  await page.getByRole('combobox', { name: 'Game review quality', exact: true }).selectOption('deeper');
  await expect(page.locator('.review-provenance')).toHaveAttribute('data-generation-id', generation);
  await expect(page.locator('.review-policy-state')).toHaveText(/Pending: Deeper.*still use Quick/);
  await page.screenshot({ path: `${images}/desktop-current.png`, fullPage: true });
  await page.locator('.report-content .insights-content').evaluate(node => { node.scrollTop = node.querySelector('.review-quality').offsetTop; });
  await page.locator('.report-content').screenshot({ path: `${images}/quality-pending.png` });
  await page.locator('.review-provenance summary').click();
  await page.locator('.report-content .insights-content').evaluate(node => { node.scrollTop = node.querySelector('.review-provenance').offsetTop; });
  await page.locator('.report-content').screenshot({ path: `${images}/provenance.png` });
  await page.getByRole('button', { name: 'Rerun game review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await expect(page.locator('.review-provenance')).toHaveAttribute('data-policy', 'deeper');
  await expect(page.locator('.review-provenance')).not.toHaveAttribute('data-generation-id', generation);
  results.compiled = { status: 'passed', origin: 'http://127.0.0.1:4335', quickReview: true, pendingDidNotRerun: true, explicitDeeperRerun: true };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: /Insights/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.review-breakdown').screenshot({ path: `${images}/mobile-breakdown.png` });
  await browser.close(); browser = null;

  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'linea-phase4-zoom-'));
  const extension = path.join(temporary, 'extension'); await fs.mkdir(extension);
  await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Disposable Linea report zoom QA', version: '1.0', permissions: ['tabs'], background: { service_worker: 'background.js' } }));
  await fs.writeFile(path.join(extension, 'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
  zoomContext = await chromium.launchPersistentContext(path.join(temporary, 'profile'), { channel: 'chromium', headless: true, viewport: null, ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'], args: ['--window-size=1440,900', '--enable-unsafe-extension-debugging', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = zoomContext.serviceWorkers()[0] || await zoomContext.waitForEvent('serviceworker');
  await zoomContext.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  const zoomed = zoomContext.pages()[0]; await zoomed.emulateMedia({ reducedMotion: 'reduce' });
  await zoomed.goto('http://127.0.0.1:4325/'); await expect(zoomed.getByRole('gridcell')).toHaveCount(64);
  const factor = await worker.evaluate(async () => { const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('http://127.0.0.1:4325')); await chrome.tabs.setZoom(tab.id, 2); return chrome.tabs.getZoom(tab.id); });
  await expect.poll(() => zoomed.evaluate(() => devicePixelRatio)).toBe(2);
  await importGame(zoomed);
  await zoomed.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: /Insights/ }).click();
  await zoomed.getByRole('combobox', { name: 'Game review quality', exact: true }).selectOption('quick');
  await zoomed.locator('.review-quality').getByRole('button', { name: 'Review this game', exact: true }).click();
  await expect(zoomed.locator('.accuracy-coverage')).toHaveText(/Full game reviewed/, { timeout: 30000 });
  const geometry = await zoomed.evaluate(() => ({ innerWidth, outerWidth, devicePixelRatio, page: document.documentElement.scrollWidth, cssZoom: getComputedStyle(document.documentElement).zoom, visualScale: visualViewport.scale }));
  expect(factor).toBe(2); expect(geometry.innerWidth).toBe(720); expect(geometry.page).toBeLessThanOrEqual(720); expect(geometry.cssZoom).toBe('1'); expect(geometry.visualScale).toBe(1);
  await zoomed.locator('.review-breakdown').scrollIntoViewIfNeeded();
  const cdp = await zoomContext.newCDPSession(zoomed); const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await fs.writeFile(`${images}/native-200-percent-report.png`, Buffer.from(image.data, 'base64'));
  results.nativeZoom = { status: 'passed', factor, geometry, reviewControlUsable: true, actualReviewCompleted: true };
} catch (error) { results.error = error.message; process.exitCode = 1; }
finally { await browser?.close(); await zoomContext?.close(); if (temporary) await fs.rm(temporary, { recursive: true, force: true }); }
await fs.writeFile(`${output}/supplemental-report-checks.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
