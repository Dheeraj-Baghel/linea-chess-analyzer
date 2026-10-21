import { test, expect } from './fixtures.js';
import { counter, originalPgn, shortPgn, start, advancedReview } from './helpers.js';

// Provider responses are fixtures; local Stockfish and review are real.
const archiveUrl = month => `https://api.chess.com/pub/player/fixture-player/games/${month}`;
const record = (id, format = 'rapid', extra = {}) => ({
  url: `https://www.chess.com/game/live/${id}`, pgn: shortPgn, rules: 'chess', rated: true,
  end_time: 1790000000 + Number(id), time_class: format, time_control: '300+3',
  white: { username: 'Alice', result: 'win', rating: 1500 }, black: { username: 'fixture-player', result: 'checkmated', rating: 1600 }, ...extra,
});
async function fixtures(page, { archiveStatus = 200, delay = 0, metadata = null } = {}) {
  await page.route('https://api.chess.com/pub/player/fixture-player/games/**', async route => {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const url = route.request().url();
    const data = url.endsWith('/archives') ? { archives: [archiveUrl('2026/09'), archiveUrl('2026/10')] }
      : url.endsWith('/2026/09') ? { games: [record('123455', 'blitz')] }
        : { games: [record('123456'), record('123457', 'blitz'), record('123458', 'bullet', { rules: 'chess960' }), record('123459', 'daily', { url: 'https://www.chess.com/game/daily/123459' })] };
    try { await route.fulfill({ status: archiveStatus, contentType: 'application/json', body: JSON.stringify(data) }); } catch { /* Deliberately canceled fetch. */ }
  });
  if (metadata) await page.route('**/api/chesscom/resolve?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(metadata) }));
}
async function openImport(page) { await page.getByRole('button', { name: 'Import game', exact: true }).click(); const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Game link / FEN', exact: true }).click(); return dialog; }
async function chooseExact(dialog, id = '123456') {
  await expect(dialog.locator('.archive-game')).toHaveCount(1);
  await expect(dialog.locator('.archive-game')).toHaveAttribute('data-game-id', id);
  await dialog.locator('.archive-game').click(); await expect(dialog).not.toBeVisible();
}

test('username archives, month/format filters and selected game import start an actual local review', async ({ page }) => {
  await fixtures(page); await start(page);
  const dialog = await openImport(page); await dialog.locator('#chesscom-user').fill('fixture-player');
  await dialog.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(dialog.locator('.archive-count')).toHaveText('3 public standard games · fixture-player');
  await expect(dialog.locator('.archive-game')).toHaveCount(3);
  await dialog.getByRole('combobox', { name: 'Filter games by time format', exact: true }).selectOption('rapid'); await expect(dialog.locator('.archive-game')).toHaveCount(1);
  await dialog.getByRole('combobox', { name: 'Chess.com game archive month', exact: true }).selectOption('2026-09'); await expect(dialog.locator('.archive-game')).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Filter games by time format', exact: true }).selectOption('all'); await expect(dialog.locator('.archive-game')).toHaveCount(1);
  await dialog.locator('.archive-game').click(); await expect(dialog).not.toBeVisible();
  await expect(page.locator('.sample-badge')).toHaveText('CHESS.COM'); await expect(counter(page)).toHaveText('0');
  await expect(page.locator('.accuracy-coverage')).toHaveText(/Loading review engine|Reviewing move|Full game reviewed/);
  await advancedReview(page); await expect(page.locator('.personal-coach select')).toHaveValue('b');
  await expect(page.locator('.accuracy-player small').last()).toHaveText(/partial|complete/, { timeout: 15000 });
  expect(await originalPgn(page)).toBe(shortPgn);
});

test('game URL plus username/month finds exactly the requested live game in the shared picker', async ({ page }) => {
  await fixtures(page); await start(page);
  const dialog = await openImport(page); await dialog.getByRole('button', { name: 'By game link', exact: true }).click();
  await dialog.locator('#chesscom-url').fill('https://www.chess.com/analysis/game/live/123456/analysis');
  await dialog.locator('#chesscom-user').fill('fixture-player'); await dialog.locator('#chesscom-link-month').fill('2026-10');
  await dialog.getByRole('button', { name: 'Find game', exact: true }).click();
  await expect(counter(page)).toHaveText('28'); await chooseExact(dialog);
  await expect(page.locator('.sample-badge')).toHaveText('CHESS.COM'); expect(await originalPgn(page)).toBe(shortPgn);
});

test('URL-only lookup uses metadata but still requires the exact game in public archives', async ({ page }) => {
  await fixtures(page, { metadata: { usernames: ['fixture-player'], month: '2026-10' } }); await start(page);
  const dialog = await openImport(page); await dialog.getByRole('button', { name: 'By game link', exact: true }).click();
  await dialog.locator('#chesscom-url').fill('https://www.chess.com/game/live/123456');
  await dialog.getByRole('button', { name: 'Find game', exact: true }).click(); await chooseExact(dialog);
  await expect(page.locator('.sample-badge')).toHaveText('CHESS.COM');
});

test('URL-only fallback asks for a player without deleting the existing game', async ({ page }) => {
  await fixtures(page, { metadata: { usernames: [], month: null } }); await start(page);
  const dialog = await openImport(page); await dialog.getByRole('button', { name: 'By game link', exact: true }).click();
  await dialog.locator('#chesscom-url').fill('https://www.chess.com/game/live/123456');
  await dialog.getByRole('button', { name: 'Find game', exact: true }).click(); await expect(dialog.getByRole('alert')).toHaveText(/Add either player’s username/);
  await expect(counter(page)).toHaveText('28');
  await dialog.locator('#chesscom-user').fill('fixture-player'); await dialog.getByRole('button', { name: 'Find game', exact: true }).click(); await chooseExact(dialog);
});

for (const status of [404, 429, 503]) test(`Chess.com HTTP ${status} remains a recoverable import error`, async ({ page }) => {
  await fixtures(page, { archiveStatus: status }); await start(page);
  const dialog = await openImport(page); await dialog.locator('#chesscom-user').fill('fixture-player'); await dialog.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Find games', exact: true })).toBeEnabled(); await expect(counter(page)).toHaveText('28');
});

test('Cancel ignores late results; closing the presentation preserves the search without auto-importing', async ({ page }) => {
  await fixtures(page, { delay: 900 }); await start(page); let dialog = await openImport(page);
  await dialog.locator('#chesscom-user').fill('fixture-player'); await dialog.getByRole('button', { name: 'Find games', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Find games', exact: true })).toBeEnabled();
  await page.waitForTimeout(1000); await expect(dialog.locator('.archive-game')).toHaveCount(0); await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Find games', exact: true }).click(); await page.keyboard.press('Escape');
  dialog = await openImport(page); await expect(dialog.locator('#chesscom-user')).toHaveValue('fixture-player');
  await expect(dialog.locator('.archive-game')).toHaveCount(3);
  await expect(counter(page)).toHaveText('28'); await expect(page.locator('.sample-badge')).toHaveText('SAMPLE GAME');
});

test('invalid username, non-Chess.com link and nonexistent game show meaningful feedback', async ({ page }) => {
  await fixtures(page); await start(page); const dialog = await openImport(page);
  await dialog.locator('#chesscom-user').fill('not/a/username'); await dialog.getByRole('button', { name: 'Find games', exact: true }).click(); await expect(dialog.getByRole('alert')).toHaveText(/username/);
  await dialog.getByRole('button', { name: 'By game link', exact: true }).click(); await dialog.locator('#chesscom-url').fill('https://evil.example/game/live/123456');
  await dialog.getByRole('button', { name: 'Find game', exact: true }).click(); await expect(dialog.getByRole('alert')).toHaveText(/chess.com game link/i);
  await dialog.locator('#chesscom-url').fill('https://www.chess.com/game/live/999999'); await dialog.locator('#chesscom-user').fill('fixture-player');
  await dialog.getByRole('button', { name: 'Find game', exact: true }).click(); await expect(dialog.getByRole('alert')).toHaveText(/not found/);
});
