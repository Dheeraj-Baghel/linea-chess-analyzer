import { expect } from '@playwright/test';

export const shortPgn = `[Event "Browser regression study"]
[White "Alice"]
[Black "Bob"]
[WhiteElo "1500"]
[BlackElo "1600"]
[Result "*"]
[TimeControl "300+3"]

1. e4 {[%clk 0:05:01]} e5 {[%clk 0:04:59]} 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Bc5 *`;
export const matePgn = `[Event "Checkmate regression"]
[White "Alice"]
[Black "Bob"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;
export const square = (page, name) => page.locator(`[data-square="${name}"]`);
export const counter = page => page.locator('.move-counter strong');

export async function start(page, { pause = true } = {}) {
  await page.goto('/sample'); // Board-only tests enter the explicit illustrative study.
  await expect(page).toHaveTitle(/^Linea/);
  await expect(page.getByRole('link', { name: 'Linea chess analysis', exact: true })).toBeVisible();
  await expect(page.getByRole('gridcell')).toHaveCount(64);
  if (pause) await pauseEngine(page);
  else await resumeEngine(page); // Product rollout: live searches are deliberate.
}
export async function resumeEngine(page) {
  const advanced = page.getByText('Advanced analysis & evidence', { exact: true });
  if (await advanced.isVisible() && !(await page.getByRole('button', { name: 'Resume position analysis', exact: true }).isVisible())) await advanced.click();
  const button = page.getByRole('button', { name: 'Resume position analysis', exact: true });
  if (await button.isVisible()) { await button.click(); return; }
  const drawer = page.getByRole('button', { name: 'Engine settings', exact: true });
  if (await drawer.isVisible()) { await drawer.click(); if (await button.isVisible()) await button.click(); await page.getByRole('button', { name: 'Close dialog', exact: true }).click(); }
}
export async function pauseEngine(page) {
  const button = page.getByRole('button', { name: 'Pause position analysis', exact: true });
  if (await button.isVisible()) { await button.click(); return; }
  const drawer = page.getByRole('button', { name: 'Engine settings', exact: true });
  if (await drawer.isVisible()) {
    await drawer.click();
    if (await button.isVisible()) await button.click();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  }
}
export async function importText(page, text, type = 'PGN game') {
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (type === 'FEN position') { await dialog.getByRole('button', { name: 'Game link / FEN', exact: true }).click(); }
  await dialog.getByRole('button', { name: type, exact: true }).first().click();
  await dialog.locator('#import-text').fill(text);
  if (type !== 'FEN position') await dialog.getByRole('combobox', { name: 'PGN player to focus on' }).selectOption('w');
  await dialog.getByRole('button', { name: type === 'FEN position' ? 'Load position' : 'Load game', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(counter(page)).toHaveText('0');
}
export async function advancedReview(page) {
  const summary = page.getByText('Advanced analysis & evidence', { exact: true });
  if (await summary.isVisible() && !await page.locator('.advanced-review').evaluate(element => element.open)) await summary.click();
}
export async function guidedReview(page) {
  const start = page.getByRole('button', { name: 'Start review', exact: true });
  if (await start.isVisible()) await start.click();
  else if (await page.getByRole('button', { name: 'Explore partial review', exact: true }).isVisible()) await page.getByRole('button', { name: 'Explore partial review', exact: true }).click();
}
export async function currentFen(page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const value = await dialog.locator('#export-text').inputValue();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  return value;
}
export async function originalPgn(page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Game PGN', exact: true }).click();
  const value = await dialog.locator('#export-text').inputValue();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  return value;
}
export async function clickMove(page, from, to) { await square(page, from).click(); await square(page, to).click(); }
export async function drag(page, from, to, button = 'left') {
  await page.locator('.chessboard').scrollIntoViewIfNeeded();
  const a = await square(page, from).boundingBox(), b = await square(page, to).boundingBox();
  if (!a || !b) throw new Error('Board squares are not visible');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down({ button });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up({ button });
}
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}
