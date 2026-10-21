import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import { importText, matePgn, start, advancedReview, guidedReview } from './helpers.js';

async function scan(page, name) {
  // Sample the settled interface rather than transient modal fade opacity.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(250);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await fs.mkdir('artifacts/testing/accessibility', { recursive: true });
  await fs.writeFile(`artifacts/testing/accessibility/${name}.json`, JSON.stringify({ url: page.url(), violations: results.violations, incomplete: results.incomplete, passes: results.passes.length }, null, 2));
  await fs.mkdir('artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: `artifacts/screenshots/baseline-${name}.png`, fullPage: true });
  expect(results.violations.map(item => ({ id: item.id, impact: item.impact, description: item.description, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))).toEqual([]);
}

test('desktop board meets automated WCAG A/AA checks', async ({ page }) => { await start(page); await scan(page, 'desktop-board'); });
test('Chess.com import dialog meets automated WCAG A/AA checks', async ({ page }) => { await start(page); await page.getByRole('button', { name: 'Import game', exact: true }).click(); await scan(page, 'chesscom-dialog'); });
test('display settings and promotion picker meet automated WCAG A/AA checks', async ({ page }) => {
  await start(page); await page.getByRole('button', { name: 'Display settings', exact: true }).click(); await scan(page, 'settings-dialog');
  await page.keyboard.press('Escape'); await importText(page, '7k/P7/8/8/8/8/8/6K1 w - - 0 1', 'FEN position');
  await page.locator('[data-square="a7"]').click(); await page.locator('[data-square="a8"]').click(); await scan(page, 'promotion-dialog');
});
test('reviewed move list and populated coaching meet automated WCAG A/AA checks', async ({ page }) => {
  await start(page); await importText(page, matePgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await scan(page, 'reviewed-moves');
  await guidedReview(page); await advancedReview(page); await scan(page, 'coaching');
});
test('phone board and insights meet automated WCAG A/AA checks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await start(page); await scan(page, 'mobile-board');
  await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: /Insights/ }).click(); await scan(page, 'mobile-insights');
});

test('populated archive results, URL error state and PGN/FEN dialogs have accessible labels and contrast', async ({ page }) => {
  await page.route('https://api.chess.com/pub/player/qa-player/games/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().url().endsWith('/archives') ? { archives: ['https://api.chess.com/pub/player/qa-player/games/2026/10'] } : { games: [{ url: 'https://www.chess.com/game/live/12345', rules: 'chess', pgn: '1. e4 e5 *', white: { username: 'QA White', result: 'win' }, black: { username: 'QA Black', result: 'resigned' }, end_time: 1790000000, time_class: 'rapid', time_control: '600' }] }) }));
  await start(page); await page.getByRole('button', { name: 'Import game', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Game link / FEN', exact: true }).click(); await dialog.locator('#chesscom-user').fill('qa-player'); await dialog.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(dialog.locator('.archive-game')).toHaveCount(1); await scan(page, 'archive-results');
  await dialog.getByRole('button', { name: 'By game link', exact: true }).click(); await dialog.locator('#chesscom-url').fill('https://wrong.example/game/live/1'); await dialog.getByRole('button', { name: 'Find game', exact: true }).click(); await scan(page, 'url-error');
  await dialog.getByRole('button', { name: 'PGN game', exact: true }).first().click(); await scan(page, 'pgn-dialog');
  await dialog.getByRole('button', { name: 'FEN position', exact: true }).click(); await scan(page, 'fen-dialog');
});
