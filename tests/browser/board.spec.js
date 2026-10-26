import { test, expect } from './fixtures.js';
import { Chess } from 'chess.js';
import fs from 'node:fs/promises';
import { clickMove, collectErrors, counter, currentFen, drag, importText, matePgn, originalPgn, shortPgn, square, start, tool, advancedReview, closeTools } from './helpers.js';

const initial = new Chess().fen();

test('the highlighted move stays within the guided move-list scroll viewport', async ({ page }) => {
  await start(page);
  const visible = async () => page.evaluate(() => {
    const list = document.querySelector('.gr-moves').getBoundingClientRect();
    const current = document.querySelector('.move-entry.current').getBoundingClientRect();
    return current.top >= list.top && current.bottom <= list.bottom;
  });
  await expect.poll(visible).toBe(true);
  await page.getByRole('button', { name: 'Last position (End)', exact: true }).click();
  await expect.poll(visible).toBe(true);
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
  await expect.poll(visible).toBe(true);
});

test('all navigation controls, keyboard shortcuts and clicked move highlight stay synchronized', async ({ page }) => {
  const errors = collectErrors(page); await start(page); await importText(page, shortPgn);
  await expect(page.getByRole('button', { name: 'First position (Home)', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click();
  await expect(counter(page)).toHaveText('1');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', /White pawn/);
  await expect(page.locator('.move-entry[aria-current="step"]')).toHaveText(/e4/);
  await page.keyboard.press('ArrowRight'); await expect(counter(page)).toHaveText('2');
  await page.keyboard.press('ArrowLeft'); await expect(counter(page)).toHaveText('1');
  await page.getByRole('button', { name: 'Last position (End)', exact: true }).click(); await expect(counter(page)).toHaveText('8');
  await expect(page.getByRole('button', { name: 'Next move (Right arrow)', exact: true })).toBeDisabled();
  await page.keyboard.press('Home'); await expect(counter(page)).toHaveText('0');
  // Reviewed moves append their classification to the accessible name ("Go to 2. Nf3, Book").
  await page.getByRole('button', { name: /^Go to 2\. Nf3(,|$)/ }).click(); await expect(counter(page)).toHaveText('3');
  await expect(page.locator('.move-entry.current')).toHaveAttribute('aria-label', /^Go to 2\. Nf3(,|$)/);
  expect(errors).toEqual([]);
});

test('legal hints, capture rings and illegal moves use real chess legality', async ({ page }) => {
  await start(page); await importText(page, shortPgn);
  await square(page, 'e2').click();
  await expect(square(page, 'e2')).toHaveAttribute('aria-selected', 'true');
  await expect(square(page, 'e3')).toHaveAttribute('aria-label', /legal destination/);
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', /legal destination/);
  await square(page, 'e5').click(); await expect(counter(page)).toHaveText('0');
  expect(await currentFen(page)).toBe(initial);
  await importText(page, '1. e4 d5 2. exd5 *');
  await page.getByRole('button', { name: /^Go to 1… d5(,|$)/ }).click();
  await square(page, 'e4').click();
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', /legal capture/);
  await expect(square(page, 'd5').locator('.capture-hint')).toHaveCount(1);
  await square(page, 'd5').click();
  await expect(counter(page)).toHaveText('3');
  await expect(page.locator('.material-info')).toHaveText(/White \+1/);
  await expect(page.locator('.captured-pieces').last().locator('img')).toHaveCount(1);
  await expect(page.locator('.captured-pieces').last()).toHaveAttribute('aria-label', /pawn/);
});

test('alternative click moves and variation navigation never mutate the original game', async ({ page }) => {
  const errors = collectErrors(page); await start(page); await importText(page, shortPgn);
  await clickMove(page, 'd2', 'd4');
  await expect(page.locator('.variation-banner')).toBeVisible();
  await expect(counter(page)).toHaveText('1');
  expect(await originalPgn(page)).toBe(shortPgn);
  await clickMove(page, 'd7', 'd5');
  await expect(counter(page)).toHaveText('2');
  await page.getByRole('button', { name: 'Previous move (Left arrow)', exact: true }).click(); await expect(counter(page)).toHaveText('1');
  await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click(); await expect(counter(page)).toHaveText('2');
  await page.locator('.variation-banner').getByRole('button', { name: 'Return to game', exact: true }).click();
  await expect(counter(page)).toHaveText('0'); await expect(page.locator('.variation-banner')).toHaveCount(0);
  expect(await currentFen(page)).toBe(initial); expect(await originalPgn(page)).toBe(shortPgn);
  expect(errors).toEqual([]);
});

test('drag moves work, variations can branch and recorded-move clicks return to game', async ({ page }) => {
  await start(page); await importText(page, shortPgn);
  await drag(page, 'd2', 'd4');
  await expect(square(page, 'd4')).toHaveAttribute('aria-label', /White pawn/);
  await expect(page.locator('.variation-banner')).toBeVisible();
  await drag(page, 'd7', 'd5'); await expect(counter(page)).toHaveText('2');
  await page.getByRole('button', { name: 'Previous move (Left arrow)', exact: true }).click();
  await drag(page, 'g8', 'f6'); await expect(counter(page)).toHaveText('2');
  await expect(page.locator('.variation-moves')).toHaveText(/Nf6/);
  await expect(page.locator('.variation-moves')).not.toHaveText(/d5/);
  await page.getByRole('button', { name: /^Go to 2\. Nf3/ }).click();
  await expect(page.locator('.variation-banner')).toHaveCount(0); await expect(counter(page)).toHaveText('3');
});

test('annotation drag, right-pointer drawing, color replacement, eraser and clear cannot move pieces', async ({ page }) => {
  const errors = collectErrors(page); await start(page); await importText(page, shortPgn);
  await (await tool(page, /^Annotate/)).click();
  await drag(page, 'e2', 'e4'); await expect(page.locator('.manual-arrow')).toHaveCount(1); await expect(counter(page)).toHaveText('0');
  await square(page, 'd4').click(); await expect(square(page, 'd4').locator('.square-mark')).toHaveCount(1);
  await (await tool(page, 'Rose annotation color')).click();
  await drag(page, 'e2', 'e4'); await expect(page.locator('.manual-arrow')).toHaveCount(1);
  await expect(page.locator('.manual-arrow line')).toHaveCSS('stroke', 'rgb(188, 92, 105)');
  await page.getByRole('button', { name: 'Exit annotation mode', exact: true }).click();
  await drag(page, 'g1', 'f3', 'right'); await expect(page.locator('.manual-arrow')).toHaveCount(2); await expect(counter(page)).toHaveText('0');
  await square(page, 'b3').click({ button: 'right' }); await expect(square(page, 'b3').locator('.square-mark')).toHaveCount(1);
  expect(await currentFen(page)).toBe(initial);
  await (await tool(page, 'Eraser: remove annotations touching a square')).click(); await square(page, 'e4').click();
  await expect(page.locator('.manual-arrow')).toHaveCount(1);
  await (await tool(page, 'Clear annotations for this position')).click();
  await expect(page.locator('.manual-arrow')).toHaveCount(0); await expect(page.locator('.square-mark')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('two-tap arrow tool and per-position marks survive navigation without mixing with engine arrows', async ({ page }) => {
  await start(page); await importText(page, shortPgn);
  await (await tool(page, 'Two-tap arrow tool: choose the start, then the destination')).click();
  await square(page, 'e2').click(); await expect(square(page, 'e2')).toHaveClass(/arrow-origin/);
  await square(page, 'e4').click(); await expect(page.locator('.manual-arrow')).toHaveCount(1);
  await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click();
  await expect(page.locator('.manual-arrow')).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous move (Left arrow)', exact: true }).click();
  await expect(page.locator('.manual-arrow')).toHaveCount(1);
});

test('flip keeps board square colors, coordinates, and White-perspective evaluation orientation correct', async ({ page }) => {
  await start(page); await importText(page, shortPgn);
  await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'a8');
  await expect(square(page, 'a1')).toHaveClass(/dark/);
  await expect(square(page, 'a8')).toHaveClass(/light/);
  await page.keyboard.press('f');
  await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
  await expect(square(page, 'h1').locator('.rank-label')).toHaveAttribute('data-label', '1');
  await expect(square(page, 'a8')).toHaveClass(/light/);
  await expect(page.locator('.eval-track')).toHaveClass(/flipped/);
  await page.keyboard.press('c'); await expect(page.locator('.coordinate')).toHaveCount(0);
  await page.keyboard.press('c'); await expect(page.locator('.coordinate')).toHaveCount(16);
  await page.getByRole('button', { name: 'Flip board (F)', exact: true }).click();
  await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'a8');
});

for (const promoted of ['queen', 'rook', 'bishop', 'knight']) {
  test(`promotion picker promotes to ${promoted} and preserves the FEN source`, async ({ page }) => {
    await start(page); const fen = '7k/P7/8/8/8/8/8/6K1 w - - 0 1'; await importText(page, fen, 'FEN position');
    await clickMove(page, 'a7', 'a8');
    await expect(page.getByRole('dialog', { name: 'Choose your promotion.' })).toBeVisible();
    await page.getByRole('button', { name: `Promote to ${promoted}`, exact: true }).click();
    await expect(square(page, 'a8')).toHaveAttribute('aria-label', new RegExp(`White ${promoted}`));
    await expect(page.locator('.variation-banner')).toBeVisible();
    expect(await originalPgn(page)).toContain(fen);
  });
}

test('canceling promotion leaves the position untouched', async ({ page }) => {
  await start(page); const fen = '7k/P7/8/8/8/8/8/6K1 w - - 0 1'; await importText(page, fen, 'FEN position');
  await clickMove(page, 'a7', 'a8'); await page.keyboard.press('Escape');
  await expect(square(page, 'a7')).toHaveAttribute('aria-label', /White pawn/); expect(await currentFen(page)).toBe(fen);
});

test('castling moves king and rook and en-passant removes the passed pawn', async ({ page }) => {
  await start(page); await importText(page, '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O *');
  await page.getByRole('button', { name: /^Go to 3… Nf6(,|$)/ }).click(); await clickMove(page, 'e1', 'g1');
  await expect(square(page, 'g1')).toHaveAttribute('aria-label', /White king/); await expect(square(page, 'f1')).toHaveAttribute('aria-label', /White rook/);
  await importText(page, '1. e4 h5 2. e5 d5 3. exd6 *');
  await page.getByRole('button', { name: /^Go to 2… d5(,|$)/ }).click(); await clickMove(page, 'e5', 'd6');
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', /empty/); await expect(square(page, 'd6')).toHaveAttribute('aria-label', /White pawn/);
});

test('check/checkmate, last-move highlights and recorded clocks display from real game metadata', async ({ page }) => {
  await start(page); await importText(page, shortPgn);
  await page.getByRole('button', { name: /^Go to 1… e5(,|$)/ }).click();
  await expect(page.locator('.player-clock').first()).toHaveText(/04:59/); await expect(page.locator('.player-clock').last()).toHaveText(/05:01/);
  await expect(square(page, 'e7')).toHaveClass(/last-move/); await expect(square(page, 'e5')).toHaveClass(/last-move/);
  await importText(page, matePgn); await page.getByRole('button', { name: 'Last position (End)', exact: true }).click();
  await expect(page.locator('.turn-info')).toHaveText('Checkmate · Black wins');
  await expect(square(page, 'e1')).toHaveClass(/in-check/);
  await advancedReview(page); await expect(page.locator('.engine-evaluation strong')).toHaveText('−M0');
  await expect(page.locator('.engine-evaluation')).toHaveText(/Black wins by checkmate/);
});

test('autoplay uses selectable speeds, pauses on board interaction and restarts at the end', async ({ page }) => {
  await start(page); await importText(page, shortPgn);
  await page.getByRole('combobox', { name: 'Playback speed', exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Autoplay game (Space)', exact: true }).click(); await expect(counter(page)).toHaveText('1');
  await square(page, 'g8').click(); await expect(page.getByRole('button', { name: 'Autoplay game (Space)', exact: true })).toBeVisible();
  const paused = await counter(page).innerText(); await page.waitForTimeout(950); await expect(counter(page)).toHaveText(paused);
  await page.getByRole('button', { name: 'Last position (End)', exact: true }).click();
  await page.getByRole('button', { name: 'Autoplay game (Space)', exact: true }).click(); await expect(counter(page)).toHaveText('0');
  await page.getByRole('button', { name: 'Pause playback (Space)', exact: true }).click();
});

test('keyboard square selection, Escape cancellation and focus mode remain operable', async ({ page }) => {
  await start(page); await importText(page, shortPgn);
  await square(page, 'e2').focus(); await page.keyboard.press('Enter'); await expect(square(page, 'e2')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Alt+ArrowUp'); await expect(square(page, 'e3')).toBeFocused();
  await page.keyboard.press('Alt+ArrowUp'); await expect(square(page, 'e4')).toBeFocused(); await page.keyboard.press('Enter'); await expect(counter(page)).toHaveText('1');
  await square(page, 'e7').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape'); await expect(square(page, 'e7')).toHaveAttribute('aria-selected', 'false');
  await (await tool(page, 'Expand board into focus view')).click();
  await expect(page.locator('.app')).toHaveClass(/focus-view/); await expect(page.locator('.navigation-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click(); await expect(counter(page)).toHaveText('2');
  await page.getByRole('button', { name: 'Exit focus view', exact: true }).click(); await expect(page.locator('.review-panel')).toBeVisible();
});

test('FEN/PGN clipboard and download preserve exact source, including original comments', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await start(page); await importText(page, shortPgn); await clickMove(page, 'd2', 'd4');
  await (await tool(page, 'Copy FEN')).click();
  const copiedFen = await page.evaluate(() => navigator.clipboard.readText()); expect(new Chess(copiedFen).get('d4')?.type).toBe('p');
  await (await tool(page, 'Copy PGN')).click(); expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shortPgn);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download PGN', exact: true }).click();
  const file = await download; expect(await fs.readFile(await file.path(), 'utf8')).toBe(shortPgn);
});

test('invalid import shows feedback without deleting the current game; PGN file upload works', async ({ page }) => {
  await start(page); await page.getByRole('button', { name: 'Import game', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Game link / FEN', exact: true }).click(); await dialog.getByRole('button', { name: 'FEN position', exact: true }).click();
  await dialog.locator('#import-text').fill('garbage'); await dialog.getByRole('button', { name: 'Load position', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible(); await expect(page.locator('.move-counter strong')).toHaveText('28');
  await dialog.getByRole('button', { name: 'PGN game', exact: true }).first().click();
  await dialog.locator('input[type=file]').setInputFiles({ name: 'study.pgn', mimeType: 'application/x-chess-pgn', buffer: Buffer.from(shortPgn) });
  await expect(dialog.locator('#import-text')).toHaveValue(shortPgn); await dialog.getByRole('combobox', { name: 'PGN player to focus on' }).selectOption('w'); await dialog.getByRole('button', { name: 'Load game', exact: true }).click();
  await expect(counter(page)).toHaveText('0'); await page.getByRole('button', { name: 'Start Game Review', exact: true }).click(); await expect(page.locator('.move-entry')).toHaveCount(8);
});

test('settings persist separately from transient games and respect reduced motion', async ({ page }) => {
  await start(page); await page.getByRole('button', { name: 'Display settings', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Walnut', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Figurine', exact: true })).toHaveCount(0);
  await dialog.getByText('Move sounds', { exact: true }).click(); await dialog.getByText('Board animation', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.chessboard')).toHaveClass(/theme-walnut/); await expect(page.locator('.chessboard img.piece-image[src*="/pieces/cburnett/"]')).toHaveCount(32);
  await page.reload(); await expect(page.locator('.chessboard')).toHaveClass(/theme-walnut/); await expect(page.locator('.app')).toHaveClass(/motion-off/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const animation = await square(page, 'e4').locator('.piece-wrap').evaluate(node => getComputedStyle(node).animationName); expect(animation).toBe('none');
});

test('help dialog traps focus and restores focus to the invoking control', async ({ page }) => {
  await start(page); const invoker = page.getByRole('button', { name: 'Keyboard shortcuts and help (?)', exact: true }); await invoker.click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  for (let i = 0; i < 16; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]'))).toBe(true);
  await page.keyboard.press('Escape'); await expect(invoker).toBeFocused();
});
