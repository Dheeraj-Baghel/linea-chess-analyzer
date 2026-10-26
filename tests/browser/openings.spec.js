import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import { clickMove, counter, importText, originalPgn, start, closeTools, advancedReview } from './helpers.js';

const info = page => page.getByLabel('Recorded game opening', { exact: true });

test('F02 detected name/ECO belongs to the recorded game and survives a different analysis branch', async ({ page }) => {
  await start(page); const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 *'; await importText(page, pgn);
  await expect(info(page)).toHaveText(/C60Ruy Lopez/); await expect(info(page)).toHaveAttribute('data-source', 'local');
  await clickMove(page, 'd2', 'd4'); await expect(page.locator('.variation-banner')).toBeVisible();
  await expect(info(page)).toHaveText(/C60Ruy Lopez/); expect(await originalPgn(page)).toBe(pgn);
  await page.locator('.variation-banner').getByRole('button', { name: 'Return to game' }).click(); await expect(info(page)).toHaveText(/Ruy Lopez/);
  await fs.mkdir('artifacts/screenshots/phase3b', { recursive: true }); await page.screenshot({ path: 'artifacts/screenshots/phase3b/detected-opening.png', fullPage: true });
});

test('F02 PGN headers override local detection and FEN-only positions are explicit unavailable', async ({ page }) => {
  await start(page); const pgn = '[Opening "Supplied opening"]\n[Variation "Supplied variation"]\n[ECO "D30"]\n\n1. e4 c5 *'; await importText(page, pgn);
  await expect(info(page)).toHaveText(/D30Supplied opening.*Supplied variation.*Supplied PGN metadata/);
  await expect(info(page)).toHaveAttribute('data-source', 'pgn'); expect(await originalPgn(page)).toBe(pgn);
  await importText(page, '7k/P7/8/8/8/8/8/6K1 w - - 0 1', 'FEN position');
  await expect(info(page)).toHaveText(/Opening unavailable/); await expect(info(page)).toHaveAttribute('data-source', 'unavailable');
});

test('F02 local opening lookup works with Internet access disabled after loading its local bundle', async ({ page, context }) => {
  await start(page); await expect(info(page)).toHaveAttribute('data-source', 'local');
  await context.setOffline(true);
  await importText(page, '1. e4 c5 *'); await expect(info(page)).toHaveText(/B20Sicilian Defense/);
  await importText(page, '1. d4 Nf6 2. c4 e6 3. Nc3 d5 *');
  await expect(info(page)).toHaveText(/D35Queen's Gambit Declined.*local transposition/);
  await expect(counter(page)).toHaveText('0');
});

test('F02 delayed local data does not block the board/engine and cannot overwrite newer supplied metadata', async ({ page }) => {
  let release; const held = new Promise(resolve => { release = resolve; });
  let requests = 0, workers = 0;
  page.on('worker', () => { workers++; });
  await page.route('**/src/data/openings-index.json*', async route => { requests++; await held; await route.continue(); });
  await page.goto('/sample', { waitUntil: 'domcontentloaded' }); await expect(page.getByRole('gridcell')).toHaveCount(64);
  await expect(info(page)).toHaveText(/Identifying opening/);
  await advancedReview(page); await page.getByRole('button', { name: 'Resume position analysis', exact: true }).click();
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 }); await closeTools(page);
  const before = workers;
  await importText(page, '[Opening "New supplied context"]\n[ECO "A00"]\n\n1. a3 *');
  await expect(info(page)).toHaveText(/New supplied context/); release();
  await expect(info(page)).toHaveAttribute('data-source', 'pgn');
  expect(workers).toBe(before); expect(requests).toBe(1);
});

test('F02 local dataset failure shows unavailable while board navigation remains usable', async ({ page }) => {
  await page.route('**/src/data/openings-index.json*', route => route.abort());
  await page.goto('/sample'); await expect(page.getByRole('gridcell')).toHaveCount(64);
  await expect(info(page)).toHaveText(/Opening unavailable/);
  await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click(); await expect(counter(page)).toHaveText('29');
});
