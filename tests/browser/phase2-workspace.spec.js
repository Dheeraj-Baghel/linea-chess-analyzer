import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { clickMove, counter, currentFen, importText, matePgn, originalPgn, shortPgn, square, start, advancedReview, guidedReview, resumeEngine, tool } from './helpers.js';

// Earlier rail/four-column presentation was intentionally superseded. Preserve
// legality, worker/provenance ownership and draft regressions in the new product.
const output = 'artifacts/testing/product-evolution/final/workspace-regressions';
test.beforeEach(async () => fs.mkdir(output, { recursive: true }));
async function workerTrace(page) {
  await page.addInitScript(() => { window.__jobs = []; const send = Worker.prototype.postMessage; Worker.prototype.postMessage = function (command, ...args) { if (String(command).startsWith('go ')) window.__jobs.push(command); return send.call(this, command, ...args); }; });
  const workers = []; page.on('worker', worker => workers.push(worker.url())); return workers;
}
async function axe(page, name) { const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); await fs.writeFile(`${output}/axe-${name}.json`, JSON.stringify(result, null, 2)); expect(result.violations).toEqual([]); }

test('two columns retain square board, player rows and usable transport at desktop and mobile widths', async ({ page }) => {
  await start(page); const measurements = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 1024, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 800 }]) {
    await page.setViewportSize(viewport); if (viewport.width < 768) await page.getByRole('button', { name: 'Board', exact: true }).click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const size = await page.evaluate(() => { const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON(); return { width: innerWidth, page: document.documentElement.scrollWidth, board: rect('.chessboard'), eval: rect('.eval-track'), report: rect('.review-panel'), transport: rect('.navigation-bar'), rail: rect('.tool-rail'), extra: rect('.report-column') }; });
    measurements.push(size); expect(size.page).toBeLessThanOrEqual(viewport.width); expect(Math.abs(size.board.height - size.board.width)).toBeLessThan(1); expect(Math.abs(size.eval.height - size.board.height)).toBeLessThan(1);
    expect(size.rail).toBeUndefined(); expect(size.extra).toBeUndefined(); expect(await page.locator('.navigation-bar').count()).toBe(1);
    if (viewport.width >= 1000) { expect(size.report.width).toBeGreaterThanOrEqual(400); expect(size.report.width).toBeLessThanOrEqual(480); expect(size.transport.bottom).toBeLessThanOrEqual(viewport.height); }
  }
  await fs.writeFile(`${output}/layout-matrix.json`, JSON.stringify(measurements, null, 2));
});

test('advanced toggles and breakpoints retain branch, marks, focus player and shared engine', async ({ page }) => {
  const workers = await workerTrace(page); await start(page); await importText(page, shortPgn); await resumeEngine(page);
  await clickMove(page, 'd2', 'd4'); await (await tool(page, 'Rose annotation color')).click(); await square(page, 'c4').click();
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  const fen = await currentFen(page), beforeWorkers = workers.length;
  await page.getByRole('combobox', { name: 'Choose player for personalized coaching', exact: true }).selectOption('b');
  await page.getByText('Advanced analysis & evidence', { exact: true }).click(); await page.getByText('Advanced analysis & evidence', { exact: true }).click();
  for (const width of [1600, 1024, 768, 390, 1440]) { await page.setViewportSize({ width, height: 900 }); if (width === 390) await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: 'Insights', exact: true }).click(); await expect(page.getByRole('combobox', { name: 'Choose player for personalized coaching', exact: true })).toHaveValue('b'); await expect(counter(page)).toHaveText('1'); }
  await expect(page.locator('.variation-banner')).toBeVisible(); await expect(square(page, 'c4').locator('.square-mark')).toHaveCount(1); expect(await currentFen(page)).toBe(fen); expect(await originalPgn(page)).toBe(shortPgn); expect(workers.length).toBe(beforeWorkers);
});

test('PGN/FEN/provider drafts and one pending request survive closing and resizing without auto-import', async ({ page }) => {
  let release; const held = new Promise(resolve => { release = resolve; }); const calls = [];
  await page.route('https://api.chess.com/pub/player/draft-player/games/**', async route => { const url = route.request().url(); calls.push(url); if (url.endsWith('/archives')) await held; await route.fulfill({ json: url.endsWith('/archives') ? { archives: ['https://api.chess.com/pub/player/draft-player/games/2026/10'] } : { games: [{ url: 'https://www.chess.com/game/live/778899', rules: 'chess', pgn: shortPgn, white: { username: 'Alice' }, black: { username: 'draft-player' }, time_class: 'rapid' }] } }); });
  await start(page); await page.getByRole('button', { name: 'Import game', exact: true }).click();
  let dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Game link / FEN', exact: true }).click();
  await dialog.locator('.segmented').getByRole('button', { name: 'PGN game', exact: true }).click(); await dialog.locator('#import-text').fill(shortPgn);
  await dialog.getByRole('button', { name: 'FEN position', exact: true }).click(); await dialog.locator('#import-text').fill('7k/P7/8/8/8/8/8/6K1 w - - 0 1');
  await dialog.locator('.segmented').getByRole('button', { name: 'Chess.com', exact: true }).click(); await dialog.locator('#chesscom-user').fill('draft-player'); await dialog.getByRole('button', { name: 'Find games', exact: true }).click(); await expect.poll(() => calls.length).toBe(1);
  await page.keyboard.press('Escape'); await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'Import game', exact: true }).click(); dialog = page.getByRole('dialog');
  await expect(dialog.locator('#chesscom-user')).toHaveValue('draft-player'); release(); await expect(dialog.locator('.archive-game')).toHaveCount(1); expect(calls).toHaveLength(2); await expect(counter(page)).toHaveText('28');
  await dialog.getByRole('button', { name: 'FEN position', exact: true }).click(); await expect(dialog.locator('#import-text')).toHaveValue('7k/P7/8/8/8/8/8/6K1 w - - 0 1');
  await dialog.locator('.segmented').getByRole('button', { name: 'PGN game', exact: true }).click(); await expect(dialog.locator('#import-text')).toHaveValue(shortPgn);
});

test('guided graph and notation synchronize board without resetting focus or review generation', async ({ page }) => {
  await start(page); await importText(page, matePgn); await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 }); await guidedReview(page);
  await page.getByRole('combobox', { name: 'Focus player', exact: true }).selectOption('b'); await page.locator('.chart-point').last().click(); await expect(counter(page)).toHaveText('4'); await expect(page.locator('.turn-info')).toContainText('Checkmate');
  await page.getByRole('tab', { name: 'Moves', exact: true }).click(); await expect(page.locator('.move-entry.current')).toContainText('Qh4#');
  await page.getByRole('button', { name: '← Back to overview', exact: true }).click(); await expect(page.getByRole('combobox', { name: 'Focus player', exact: true })).toHaveValue('b'); await axe(page, 'overview-focus');
});

test('Go to start and confirmed New analysis preserve saved games and clear only current branch and marks', async ({ page }) => {
  await start(page); await importText(page, shortPgn); await clickMove(page, 'd2', 'd4'); await (await tool(page, 'Rose annotation color')).click(); await square(page, 'e4').click();
  await page.getByRole('button', { name: 'Go to start', exact: true }).click(); await expect(counter(page)).toHaveText('0'); await expect(page.locator('.variation-banner')).toBeVisible(); await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click(); await expect(square(page, 'e4').locator('.square-mark')).toHaveCount(1);
  await page.getByRole('button', { name: 'New analysis', exact: true }).click(); await page.getByRole('button', { name: 'Keep current analysis', exact: true }).click(); await expect(counter(page)).toHaveText('1');
  await page.getByRole('button', { name: 'New analysis', exact: true }).click(); await page.getByRole('button', { name: 'Create new analysis', exact: true }).click(); await expect(counter(page)).toHaveText('0'); await expect(page.locator('.move-entry, .variation-banner, .square-mark')).toHaveCount(0); await expect(page.locator('.review-panel')).toContainText('Position analysis');
  await page.getByRole('button', { name: 'Recent local games', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('Alice');
});

test('on-demand advanced engine and keyboard review tabs stay operable without additional workers', async ({ page }) => {
  const workers = await workerTrace(page); await start(page, { pause: false }); await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  const count = workers.length, jobs = await page.evaluate(() => window.__jobs.length);
  await page.getByText('Advanced analysis & evidence', { exact: true }).click();
  await page.getByRole('tab', { name: 'Summary', exact: true }).focus(); await page.keyboard.press('ArrowRight'); await expect(page.getByRole('tab', { name: 'Moves', exact: true })).toBeFocused(); await page.keyboard.press('ArrowLeft'); await expect(page.getByRole('tab', { name: 'Summary', exact: true })).toBeFocused();
  await advancedReview(page); expect(workers.length).toBe(count); expect(await page.evaluate(() => window.__jobs.length)).toBe(jobs);
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'Moves', exact: true }).click(); await expect(page.getByRole('grid')).toHaveCount(0); await expect(page.locator('.compact-notation')).toBeVisible(); await axe(page, 'phone-moves');
});
