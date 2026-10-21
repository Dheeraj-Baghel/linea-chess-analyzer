import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import { parseGame } from '../../src/chess.js';
import { counter, originalPgn, start } from './helpers.js';

test.skip(process.env.LINEA_LIVE_PROVIDER !== '1', 'Run npm run test:lichess-live explicitly.');

test('live public Lichess export imports a longer completed game with exact PGN and recorded clocks', async ({ page }) => {
  test.setTimeout(90000);
  const responses = [];
  page.on('response', response => { if (response.url().startsWith('https://lichess.org/game/export/')) responses.push(response); });
  await start(page); await page.getByRole('button', { name: 'Import game', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Lichess', exact: true }).click();
  await dialog.getByRole('button', { name: 'By game link', exact: true }).click(); await dialog.locator('#lichess-url').fill('https://lichess.org/q7ZvsdUF');
  await dialog.getByRole('button', { name: 'Find game', exact: true }).click(); await expect(dialog.locator('.archive-game')).toHaveCount(1, { timeout: 40000 });
  expect(responses).toHaveLength(1); expect(responses[0].status()).toBe(200);
  const data = await responses[0].json(), game = parseGame(data.pgn);
  expect(data.id).toBe('q7ZvsdUF'); expect(game.moves.length).toBeGreaterThan(100); expect(game.moves.some(move => move.clock)).toBe(true);
  await dialog.locator('.archive-game').click(); await expect(dialog).not.toBeVisible();
  await expect(page.locator('.sample-badge')).toHaveText('LICHESS'); expect(await originalPgn(page)).toBe(data.pgn.trim());
  await expect(page.locator('.accuracy-coverage')).toHaveText(/Loading review engine|Reviewing|Partial|Full/, { timeout: 15000 });
  const pause = page.getByRole('button', { name: /\d+\/\d+ · Pause/ }); if (await pause.isVisible()) await pause.click();
  await page.getByRole('tab', { name: /^Moves/ }).click(); await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click(); await expect(counter(page)).toHaveText('1');
  await expect(page.locator('.player-clock').last()).toHaveText(/02:30/);
  await fs.mkdir('artifacts/testing/phase3a', { recursive: true }); await fs.mkdir('artifacts/screenshots/phase3a', { recursive: true });
  await fs.writeFile('artifacts/testing/phase3a/live-game.json', JSON.stringify({ checkedAt: new Date().toISOString(), id: data.id, players: data.players, plies: game.moves.length, timeControl: game.headers.TimeControl, clocks: game.moves.filter(move => move.clock).length, pgnPreserved: true, cors: responses[0].headers()['access-control-allow-origin'] }, null, 2));
  await page.screenshot({ path: 'artifacts/screenshots/phase3a/live-game.png', fullPage: true });
});

test('live public Lichess username history is bounded, non-authenticated and selectable', async ({ page }) => {
  test.setTimeout(90000);
  const responses = [];
  page.on('response', response => { if (response.url().startsWith('https://lichess.org/api/games/user/')) responses.push(response); });
  await start(page); await page.getByRole('button', { name: 'Import game', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Lichess', exact: true }).click(); await dialog.locator('#lichess-user').fill('Lance5500');
  await dialog.getByRole('button', { name: 'Find games', exact: true }).click(); await expect(dialog.locator('.archive-game').first()).toBeVisible({ timeout: 40000 });
  expect(responses).toHaveLength(1); expect(new URL(responses[0].url()).searchParams.get('max')).toBe('20');
  const rows = (await responses[0].text()).trim().split('\n').map(line => JSON.parse(line));
  expect(rows.length).toBeLessThanOrEqual(20); const selectedId = await dialog.locator('.archive-game').first().getAttribute('data-game-id');
  const selected = rows.find(row => row.id === selectedId); expect(selected).toBeTruthy();
  await dialog.locator('.archive-game').first().click(); await expect(dialog).not.toBeVisible(); expect(await originalPgn(page)).toBe(selected.pgn.trim());
  await fs.writeFile('artifacts/testing/phase3a/live-history.json', JSON.stringify({ checkedAt: new Date().toISOString(), username: 'Lance5500', selectedId, requestedMax: 20, received: rows.length, originalPgnPreserved: true, cors: responses[0].headers()['access-control-allow-origin'] }, null, 2));
});
