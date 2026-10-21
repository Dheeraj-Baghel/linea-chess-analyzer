import { test, expect } from '../browser/fixtures.js';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
const output = 'artifacts/testing/product-evolution/final';
test.beforeEach(async () => { await fs.mkdir(output, { recursive: true }); });

test('actual WebGL hero runs signed forward/reverse motion and stops offscreen', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: /Turn your mistakes/ })).toBeVisible();
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
  await page.getByRole('button', { name: 'Review my game', exact: true }).first().click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); expect(result.violations).toEqual([]);
  await fs.writeFile(`${output}/axe-homepage.json`, JSON.stringify(result, null, 2));
});

test('WebGL failure retains the static board and usable phone layout', async ({ page }) => {
  await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...args) { if (kind === 'webgl2' || kind === 'webgl') return null; return original.call(this, kind, ...args); }; });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByRole('img', { name: /Static preview of a legal/ })).toBeVisible(); await expect(page.locator('.hero-scene')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${output}/homepage-mobile-static.png`, fullPage: true });
  await page.getByRole('button', { name: 'Review my game', exact: false }).first().click(); await expect(page.getByRole('dialog')).toBeVisible();
});

test('review entry unmounts 3D and direct review route does not load the lazy hero module', async ({ page }) => {
  await page.goto('/sample'); await expect(page.getByRole('gridcell')).toHaveCount(64);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('HeroChessScene')))).toBe(false);
  await page.getByRole('link', { name: 'Linea chess analysis', exact: true }).click(); await expect(page.locator('.hero-scene canvas')).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => { window.__oldHero = document.querySelector('.hero-scene'); });
  await page.getByRole('button', { name: 'Open sample review', exact: false }).click(); await expect(page.getByRole('gridcell')).toHaveCount(64); await expect(page.locator('.hero-scene')).toHaveCount(0);
  const frames = await page.evaluate(() => window.__oldHero.dataset.frames); await page.waitForTimeout(700); expect(await page.evaluate(() => window.__oldHero.dataset.frames)).toBe(frames);
});

// ---- v2 homepage (21 Oct 2026 brief) ----
const v2 = 'artifacts/testing/v2-homepage';
test('v2: first screen at 1366x768 shows beta badge, purpose and primary CTA; no clip sources or engine on load', async ({ page }) => {
  await fs.mkdir(v2, { recursive: true });
  const requests = []; page.on('request', request => requests.push(request.url()));
  await page.setViewportSize({ width: 1366, height: 768 }); await page.goto('/'); await page.waitForTimeout(1500);
  await expect(page.getByText('FREE DURING BETA', { exact: true })).toBeInViewport();
  await expect(page.getByRole('heading', { name: /Turn your mistakes/ })).toBeInViewport();
  await expect(page.locator('.hero-copy').getByRole('button', { name: /Review my game/ })).toBeInViewport();
  expect(requests.filter(url => /\/previews\/.*\.(webm|mp4)/.test(url))).toEqual([]);
  // Engine assets live under /engine/ (worker + wasm); fixture filenames are not engine jobs.
  expect(requests.filter(url => /\/engine\/stockfish|\.wasm(\?|$)/.test(url))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await fs.writeFile(`${v2}/first-load-requests.json`, JSON.stringify(requests, null, 2));
});

test('v2: source buttons preselect the import provider and the sample CTA opens the validated Brilliant fixture', async ({ page }) => {
  await page.goto('/');
  for (const [label, expected] of [['Chess.com', /Chess\.com username/], ['Lichess', /Lichess username/]]) {
    const button = page.locator('.strip-buttons').getByRole('button', { name: label }); await button.scrollIntoViewIfNeeded(); await button.click({ force: true });
    await expect(page.getByRole('dialog').getByText(expected)).toBeVisible(); await page.keyboard.press('Escape');
  }
  await page.locator('.strip-buttons').getByRole('button', { name: /Upload PGN/ }).click({ force: true });
  await expect(page.getByRole('dialog').locator('.import-source-cards').getByRole('button', { name: 'PGN game' })).toHaveAttribute('aria-pressed', 'true'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Open sample review/ }).click();
  await expect(page.getByRole('gridcell')).toHaveCount(64);
  await expect(page.locator('.move-entry').first()).toContainText('Rxc2+');
});

test('v2: demo clips load lazily and loop with no playback buttons; Coming soon stays labelled', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-demo] .demo-status.soon')).toHaveCount(2);
  await expect(page.locator('[data-demo="ai-coach-concept-loop"]')).toContainText('Concept preview');
  await expect(page.locator('.product-demo-controls')).toHaveCount(0);
  const review = page.locator('[data-demo="brilliant-review-loop"]');
  await review.scrollIntoViewIfNeeded();
  await expect.poll(() => review.locator('video').evaluate(v => !v.paused && v.loop && v.muted), { timeout: 10000 }).toBe(true);
  const card = review.locator('.tilt-card'); const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .2); await page.waitForTimeout(500);
  const transform = await card.evaluate(el => getComputedStyle(el).transform);
  expect(transform).not.toBe('none');
});

test('v2: reduced motion shows posters without autoplay and passes axe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  const review = page.locator('[data-demo="brilliant-review-loop"]'); await review.scrollIntoViewIfNeeded(); await page.waitForTimeout(1200);
  expect(await review.locator('video').evaluate(v => v.paused)).toBe(true);
  await expect(review.locator('video')).toHaveAttribute('poster', /brilliant-review-loop\.jpg/);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); expect(result.violations).toEqual([]);
});

test('v2: no horizontal overflow at phone and tablet widths', async ({ page }) => {
  for (const [width, height] of [[390, 844], [768, 1024]]) {
    await page.setViewportSize({ width, height }); await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.hero-copy').getByRole('button', { name: /Review my game/ })).toBeInViewport();
  }
});
