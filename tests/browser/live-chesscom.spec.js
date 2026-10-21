import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import { originalPgn, start } from './helpers.js';

// Real public API and resolver calls. These tests are opt-in and serial. The
// second test uses only this run's selection, never a stale success artifact.
test.describe.configure({ mode: 'serial' });
test.skip(process.env.LINEA_LIVE_PROVIDER !== '1', 'Run npm run test:live explicitly.');
let selectedGame;

test('live Chess.com username import and exact-ID link lookup', async ({ page }) => {
  test.setTimeout(120000);
  const username = process.env.LINEA_CHESSCOM_USER || 'erik';
  const archiveResponses = [], failures = [];
  page.on('response', response => {
    if (!response.url().startsWith('https://api.chess.com/pub/')) return;
    if (response.status() !== 200) failures.push({ url: response.url(), status: response.status() });
    if (/\/games\/\d{4}\/\d{2}$/.test(response.url()) && response.status() === 200) archiveResponses.push(response);
  });
  await start(page);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.locator('#chesscom-user').fill(username);
  await dialog.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(dialog.locator('.archive-game').first()).toBeVisible({ timeout: 30000 });
  const month = await dialog.getByRole('combobox', { name: 'Chess.com game archive month', exact: true }).inputValue();
  const caption = await dialog.locator('.archive-game').first().innerText();
  expect(archiveResponses.length).toBeGreaterThan(0);
  const archive = await archiveResponses.at(-1).json();
  const expected = archive.games.filter(item => item.rules === 'chess' && item.pgn?.trim()).sort((a, b) => b.end_time - a.end_time)[0];
  await dialog.locator('.archive-game').first().click();
  await expect(dialog).not.toBeVisible();
  expect(await originalPgn(page)).toBe(expected.pgn.trim());
  await expect(page.locator('.sample-badge')).toHaveText('CHESS.COM');
  await expect(page.locator('.accuracy-coverage')).toHaveText(/Loading review engine|Reviewing|Partial|Full/);
  // A fresh page intentionally tests URL import rather than duplicate-selection
  // protection on the game that is already loaded by the preceding check.
  await start(page);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'By game link', exact: true }).click();
  await dialog.locator('#chesscom-url').fill(expected.url);
  await dialog.locator('#chesscom-user').fill(username);
  await dialog.locator('#chesscom-link-month').fill(month);
  await dialog.getByRole('button', { name: 'Find game', exact: true }).click();
  await expect(dialog.locator('.archive-game')).toHaveCount(1, { timeout: 30000 });
  await dialog.locator('.archive-game').click();
  await expect(dialog).not.toBeVisible({ timeout: 30000 });
  expect(await originalPgn(page)).toBe(expected.pgn.trim());
  await page.getByRole('tab', { name: 'Moves' }).click();
  const pause = page.getByRole('button', { name: /\d+\/\d+ \u00b7 Pause/ });
  if (await pause.isVisible()) await pause.click();
  expect(failures).toEqual([]);
  selectedGame = { exactGameUrl: expected.url, month, pgn: expected.pgn.trim(), username };
  await fs.writeFile('artifacts/testing/live-chesscom-import.json', JSON.stringify({
    checkedAt: new Date().toISOString(), provider: 'Chess.com Published Data API', username, month,
    exactGameUrl: expected.url, white: expected.white?.username, black: expected.black?.username, caption,
    pgnPreserved: true, usernameImport: 'passed', linkWithUsernameImport: 'passed', networkFailures: failures,
  }, null, 2) + '\n');
  await page.screenshot({ path: 'artifacts/screenshots/chesscom-live-import.png', fullPage: true });
});

test('live URL-only resolver either imports verified archive game or shows the documented username fallback', async ({ page }) => {
  test.setTimeout(60000);
  expect(selectedGame, 'A successful fresh username import must precede URL-only verification').toBeDefined();
  await start(page);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'By game link', exact: true }).click();
  await dialog.locator('#chesscom-url').fill(selectedGame.exactGameUrl);
  await dialog.locator('#chesscom-link-month').fill(selectedGame.month);
  await dialog.getByRole('button', { name: 'Find game', exact: true }).click();
  await expect.poll(async () => await dialog.locator('.archive-game').first().isVisible() || await dialog.getByRole('alert').isVisible(), { timeout: 40000 }).toBe(true);
  const imported = await dialog.locator('.archive-game').first().isVisible();
  if (imported) await dialog.locator('.archive-game').first().click();
  const text = imported ? null : await dialog.getByRole('alert').innerText();
  if (imported) {
    await expect(page.locator('.sample-badge')).toHaveText('CHESS.COM');
    expect(await originalPgn(page)).toBe(selectedGame.pgn);
  } else {
    expect(text).toMatch(/Add either player\u2019s username|not found/);
    await expect(page.locator('.sample-badge')).toHaveText('SAMPLE GAME');
  }
  await fs.writeFile('artifacts/testing/live-url-only.json', JSON.stringify({
    checkedAt: new Date().toISOString(), exactGameUrl: selectedGame.exactGameUrl,
    importedWithoutUsername: imported, fallback: text,
    note: 'Public metadata can be blocked. Exact-ID archive verification remains mandatory. Fallback is not a URL-only import success.',
  }, null, 2) + '\n');
});
