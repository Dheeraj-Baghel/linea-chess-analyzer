import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import { clickMove, collectErrors, counter, drag, importText, matePgn, originalPgn, shortPgn, square, start, advancedReview, tool } from './helpers.js';

test('native engine and actual MultiPV candidates work across browser engines', async ({ page }) => {
  const errors = collectErrors(page); await start(page, { pause: false });
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 40000 });
  await page.getByRole('combobox', { name: 'Number of candidate lines', exact: true }).selectOption('3'); await expect(page.locator('.candidate-line')).toHaveCount(3, { timeout: 30000 });
  await page.getByRole('button', { name: 'Pause position analysis', exact: true }).click(); expect(errors).toEqual([]);
});

test('legal drag variation and Return to game work across browser engines', async ({ page }) => {
  const errors = collectErrors(page); await start(page); await importText(page, shortPgn);
  await drag(page, 'd2', 'd4'); await expect(page.locator('.variation-banner')).toBeVisible();
  await page.locator('.variation-banner').getByRole('button', { name: 'Return to game', exact: true }).click(); await expect(counter(page)).toHaveText('0');
  expect(errors).toEqual([]);
});

test('manual drag annotations lock moves across browser engines', async ({ page }) => {
  const errors = collectErrors(page); await start(page);
  await (await tool(page, /^Annotate/)).click(); await drag(page, 'e2', 'e4'); await expect(page.locator('.manual-arrow')).toHaveCount(1); await expect(counter(page)).toHaveText('0');
  expect(errors).toEqual([]);
});

test('legal click navigation, flip and exact source export work across browser engines', async ({ page }, testInfo) => {
  const errors = collectErrors(page); await start(page); await importText(page, shortPgn);
  await clickMove(page, 'e2', 'e4'); await expect(counter(page)).toHaveText('1');
  await page.keyboard.press('f'); await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
  expect(await originalPgn(page)).toBe(shortPgn); expect(errors).toEqual([]);
  await fs.mkdir('artifacts/screenshots', { recursive: true }); await page.screenshot({ path: `artifacts/screenshots/${testInfo.project.name}-desktop.png`, fullPage: true });
});

test('review accuracy, coaching and keyboard dialogs work across browser engines', async ({ page }) => {
  const errors = collectErrors(page); await start(page); await importText(page, matePgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 45000 });
  await advancedReview(page); await expect(page.locator('.personal-coach')).toBeVisible();
  await page.getByRole('combobox', { name: 'Choose player for personalized coaching', exact: true }).selectOption('b'); await expect(page.locator('.personal-coach')).toHaveText(/Bob/);
  await page.getByRole('button', { name: 'Display settings', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]'))).toBe(true); await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('small-screen layout, promotion and reduced-motion accessibility work across browser engines', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await start(page);
  await importText(page, '7k/P7/8/8/8/8/8/6K1 w - - 0 1', 'FEN position');
  await clickMove(page, 'a7', 'a8'); await page.getByRole('button', { name: 'Promote to rook', exact: true }).click(); await expect(square(page, 'a8')).toHaveAttribute('aria-label', /White rook/);
  await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: /Insights/ }).click(); await advancedReview(page); await expect(page.locator('.engine-card')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await fs.mkdir('artifacts/testing/accessibility', { recursive: true }); await fs.writeFile(`artifacts/testing/accessibility/${testInfo.project.name}-mobile.json`, JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2));
  expect(result.violations.map(item => item.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
