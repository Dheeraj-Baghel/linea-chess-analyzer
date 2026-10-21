import { test, expect } from '../browser/fixtures.js';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
const output = 'artifacts/testing/product-evolution/final';
test.beforeEach(async () => { await fs.mkdir(output, { recursive: true }); });

test('actual WebGL hero runs signed forward/reverse motion and stops offscreen', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: /Understand/ })).toBeVisible();
  await expect(page.locator('.hero-scene canvas')).toBeVisible({ timeout: 30000 });
  await expect.poll(() => page.locator('.hero-scene').getAttribute('data-frames')).not.toBeNull();
  await page.screenshot({ path: `${output}/homepage-desktop.png`, fullPage: true });
  await page.evaluate(() => window.scrollBy(0, 300));
  await expect.poll(async () => Number(await page.locator('.hero-scene').getAttribute('data-speed'))).toBeGreaterThan(.1);
  await page.evaluate(() => window.scrollBy(0, -180));
  await expect.poll(async () => Number(await page.locator('.hero-scene').getAttribute('data-speed'))).toBeLessThan(-.08);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('.hero-scene')).toHaveAttribute('data-active', 'false');
  const frames = await page.locator('.hero-scene').getAttribute('data-frames'); await page.waitForTimeout(700); expect(await page.locator('.hero-scene').getAttribute('data-frames')).toBe(frames);
  await fs.writeFile(`${output}/hero-render-lifecycle.json`, JSON.stringify({ forwardAndReverseVerified: true, offscreenFrames: frames, afterOffscreenFrames: await page.locator('.hero-scene').getAttribute('data-frames') }, null, 2));
});

test('reduced motion uses a static edition and all import actions remain operable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await expect(page.getByRole('img', { name: /Static preview of a legal/ })).toBeVisible(); await expect(page.locator('.hero-scene')).toHaveCount(0);
  await page.getByRole('button', { name: 'Import game', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); expect(result.violations).toEqual([]);
  await fs.writeFile(`${output}/axe-homepage.json`, JSON.stringify(result, null, 2));
});

test('WebGL failure retains the static board and usable phone layout', async ({ page }) => {
  await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...args) { if (kind === 'webgl2' || kind === 'webgl') return null; return original.call(this, kind, ...args); }; });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByRole('img', { name: /Static preview of a legal/ })).toBeVisible(); await expect(page.locator('.hero-scene')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${output}/homepage-mobile-static.png`, fullPage: true });
  await page.getByRole('button', { name: 'Import a game', exact: false }).first().click(); await expect(page.getByRole('dialog')).toBeVisible();
});

test('review entry unmounts 3D and direct review route does not load the lazy hero module', async ({ page }) => {
  await page.goto('/sample'); await expect(page.getByRole('gridcell')).toHaveCount(64);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('HeroChessScene')))).toBe(false);
  await page.getByRole('link', { name: 'Linea chess analysis', exact: true }).click(); await expect(page.locator('.hero-scene canvas')).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => { window.__oldHero = document.querySelector('.hero-scene'); });
  await page.getByRole('button', { name: 'Try a sample', exact: false }).click(); await expect(page.getByRole('gridcell')).toHaveCount(64); await expect(page.locator('.hero-scene')).toHaveCount(0);
  const frames = await page.evaluate(() => window.__oldHero.dataset.frames); await page.waitForTimeout(700); expect(await page.evaluate(() => window.__oldHero.dataset.frames)).toBe(frames);
});
