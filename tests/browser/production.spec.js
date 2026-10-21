import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import { collectErrors, counter, importText, matePgn, originalPgn, shortPgn, square, start, advancedReview } from './helpers.js';

test('compiled production bundle loads with its real Stockfish worker and working board controls', async ({ page, baseURL }) => {
  const errors = collectErrors(page), missing = [];
  page.on('response', response => { if (response.url().startsWith(`${baseURL}/`) && response.status() >= 400) missing.push({ url: response.url(), status: response.status() }); });
  await start(page, { pause: false }); await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  await page.getByRole('button', { name: 'Pause position analysis', exact: true }).click(); await importText(page, shortPgn);
  await square(page, 'd2').click(); await square(page, 'd4').click(); await expect(page.locator('.variation-banner')).toBeVisible();
  expect(await originalPgn(page)).toBe(shortPgn);
  await page.locator('.variation-banner').getByRole('button', { name: 'Return to game', exact: true }).click(); await expect(counter(page)).toHaveText('0');
  await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click(); await expect(counter(page)).toHaveText('1');
  await page.getByRole('button', { name: 'Flip board (F)', exact: true }).click(); await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
  expect(errors).toEqual([]); expect(missing).toEqual([]);
});

test('production review computes accuracy and coaching and has no detected accessibility failures', async ({ page }) => {
  const errors = collectErrors(page); await start(page); await importText(page, matePgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await advancedReview(page); await expect(page.locator('.personal-coach')).toHaveText(/Alice/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await fs.writeFile('artifacts/testing/accessibility/production-coaching.json', JSON.stringify({ violations: results.violations, incomplete: results.incomplete }, null, 2));
  expect(results.violations.map(item => item.id)).toEqual([]); expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/screenshots/production-coaching.png', fullPage: true });
});

test('compiled mobile layout is square, navigable and free of horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await start(page);
  await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: 'Moves', exact: true }).click(); await expect(page.locator('.compact-notation')).toBeVisible();
  await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: /Insights/ }).click(); await advancedReview(page); await expect(page.locator('.personal-coach')).toBeVisible();
  await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: 'Board', exact: true }).click();
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, rect: document.querySelector('.chessboard').getBoundingClientRect().toJSON() }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport); expect(Math.abs(dimensions.rect.width - dimensions.rect.height)).toBeLessThan(1);
  await page.screenshot({ path: 'artifacts/screenshots/production-mobile.png', fullPage: true });
});
