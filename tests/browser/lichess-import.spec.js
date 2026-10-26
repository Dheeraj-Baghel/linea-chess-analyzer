import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { lichessRecord } from '../fixtures/lichess-games.js';
import { counter, originalPgn, start, advancedReview, closeTools } from './helpers.js';

async function open(page, mode = 'username') {
  await page.getByRole('button', { name: 'Import game', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Game link / FEN', exact: true }).click();
  await dialog.locator('.segmented').getByRole('button', { name: 'Lichess', exact: true }).click();
  if (mode === 'url') await dialog.getByRole('button', { name: 'By game link', exact: true }).click();
  return dialog;
}

test('F01 Lichess history picker preserves PGN/clocks and starts real local review only after selection', async ({ page }) => {
  const data = lichessRecord();
  await page.route('https://lichess.org/api/games/user/**', route => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify(data) + '\n' }));
  await start(page); const dialog = await open(page);
  await dialog.locator('#lichess-user').fill('bob'); await dialog.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(dialog.locator('.archive-game')).toHaveCount(1); await expect(dialog.locator('.archive-game')).toHaveText(/Alice.*Bob.*1500.*1600.*300\+3/);
  await expect(counter(page)).toHaveText('28');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); expect(axe.violations).toEqual([]);
  await fs.mkdir('artifacts/screenshots/phase3a', { recursive: true }); await page.screenshot({ path: 'artifacts/screenshots/phase3a/history-picker.png' });
  await dialog.locator('.archive-game').click(); await expect(dialog).not.toBeVisible(); await expect(page.locator('.sample-badge')).toHaveText('LICHESS');
  expect(await originalPgn(page)).toBe(data.pgn); await advancedReview(page); await expect(page.locator('.personal-coach select')).toHaveValue('b');
  await expect(page.locator('.accuracy-coverage')).toHaveText(/Full game reviewed/, { timeout: 30000 });
  await closeTools(page); await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click();
  await expect(page.locator('.player-clock').last()).toHaveText(/05:00/);
  await open(page); await expect(page.getByRole('dialog').locator('.archive-game')).toBeDisabled();
});

test('F01 exact public game ID is checked before explicit picker import', async ({ page }) => {
  const data = lichessRecord();
  await page.route('https://lichess.org/game/export/Abcd1234?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
  await start(page); const dialog = await open(page, 'url'); await dialog.locator('#lichess-url').fill('https://lichess.org/Abcd1234/black#5');
  await dialog.getByRole('button', { name: 'Find game', exact: true }).click(); await expect(dialog.locator('.archive-game')).toHaveAttribute('data-game-id', 'Abcd1234');
  await expect(counter(page)).toHaveText('28'); await dialog.locator('.archive-game').click(); expect(await originalPgn(page)).toBe(data.pgn);
});

for (const status of [404, 429, 503]) test(`F01 Lichess HTTP ${status} leaves the existing game intact`, async ({ page }) => {
  await page.route('https://lichess.org/api/games/user/**', route => route.fulfill({ status, contentType: 'application/json', body: '{}' }));
  await start(page); const dialog = await open(page); await dialog.locator('#lichess-user').fill('bob'); await dialog.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible(); await expect(counter(page)).toHaveText('28'); await expect(page.locator('.sample-badge')).toHaveText('SAMPLE GAME');
});

test('F01 explicit Cancel and provider switches reject stale work from either provider', async ({ page }) => {
  let release; const held = new Promise(resolve => { release = resolve; });
  await page.route('https://lichess.org/api/games/user/**', async route => { await held; try { await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify(lichessRecord()) + '\n' }); } catch { /* canceled */ } });
  await start(page); let dialog = await open(page); await dialog.locator('#lichess-user').fill('bob'); await dialog.getByRole('button', { name: 'Find games', exact: true }).click();
  await dialog.locator('.segmented').getByRole('button', { name: 'Chess.com', exact: true }).click(); await dialog.locator('#chesscom-user').fill('retained-draft');
  await dialog.locator('.segmented').getByRole('button', { name: 'Lichess', exact: true }).click(); await expect(dialog.locator('#lichess-user')).toHaveValue('bob');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); release();
  await page.keyboard.press('Escape'); dialog = await open(page); await expect(dialog.locator('.archive-game')).toHaveCount(0); await expect(counter(page)).toHaveText('28');
  await dialog.locator('.segmented').getByRole('button', { name: 'Chess.com', exact: true }).click(); await expect(dialog.locator('#chesscom-user')).toHaveValue('retained-draft');
});

test('F01 bounded load-more deduplicates overlap and retains earlier results after a truncated batch', async ({ page }) => {
  let count = 0;
  const rows = Array.from({ length: 20 }, (_, i) => lichessRecord(`AB${String(i).padStart(6, '0')}`, { createdAt: 1790000000000 - i * 1000 }));
  await page.route('https://lichess.org/api/games/user/**', route => {
    count++;
    const data = count === 1 ? rows.map(row => JSON.stringify(row)).join('\n') : '{"id":';
    return route.fulfill({ contentType: 'application/x-ndjson', body: data });
  });
  await start(page); const dialog = await open(page); await dialog.locator('#lichess-user').fill('bob'); await dialog.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(dialog.locator('.archive-game')).toHaveCount(20); await dialog.getByRole('button', { name: 'Load older games', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(/incomplete/); await expect(dialog.locator('.archive-game')).toHaveCount(20); await expect(counter(page)).toHaveText('28'); expect(count).toBe(2);
});

for (const [name, change] of [['ongoing', { status: 'started' }], ['variant', { variant: 'chess960' }], ['wrong ID', { id: 'Other123' }]]) test(`F01 ${name} direct games never replace the board`, async ({ page }) => {
  await page.route('https://lichess.org/game/export/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(lichessRecord(undefined, change)) }));
  await start(page); const dialog = await open(page, 'url'); await dialog.locator('#lichess-url').fill('Abcd1234'); await dialog.getByRole('button', { name: 'Find game', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible(); await expect(dialog.locator('.archive-game')).toHaveCount(0); await expect(counter(page)).toHaveText('28');
});
