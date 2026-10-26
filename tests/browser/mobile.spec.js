import { test, expect, devices } from './fixtures.js';
import { counter, importText, originalPgn, shortPgn, square, advancedReview, tool } from './helpers.js';
import fs from 'node:fs/promises';

test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
async function open(page) { await page.goto('/sample'); await expect(page.getByRole('gridcell')).toHaveCount(64); await importText(page, shortPgn); }
async function tab(page, name) { await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name, exact: name !== 'Insights' }).tap(); }
async function touchDrag(page, from, to) {
  const a = await square(page, from).boundingBox(), b = await square(page, to).boundingBox();
  const session = await page.context().newCDPSession(page);
  const point = (x, y) => ({ x, y, id: 0, radiusX: 2, radiusY: 2, force: 1 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(a.x + a.width / 2, a.y + a.height / 2)] });
  for (let i = 1; i <= 8; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(a.x + a.width / 2 + (b.x - a.x) * i / 8, a.y + a.height / 2 + (b.y - a.y) * i / 8)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

test('phone tap-to-move, hints, Return to game and all workspace tabs work', async ({ page }) => {
  await open(page); await square(page, 'd2').tap(); await expect(square(page, 'd4')).toHaveAttribute('aria-label', /legal destination/); await square(page, 'd4').tap();
  await expect(page.locator('.variation-banner')).toBeVisible(); await expect(counter(page)).toHaveText('1');
  await tab(page, 'Moves'); await expect(page.locator('.variation-strip')).toBeVisible();
  await page.locator('.variation-strip').getByRole('button', { name: 'Return to game', exact: true }).tap();
  await tab(page, 'Board'); await expect(counter(page)).toHaveText('0');
  await tab(page, 'Insights'); await advancedReview(page); await expect(page.locator('.engine-card')).toBeVisible();
  await tab(page, 'Board'); expect(await originalPgn(page)).toBe(shortPgn);
});

test('real browser touch dragging moves pieces without creating annotations', async ({ page }) => {
  await open(page); await touchDrag(page, 'd2', 'd4'); await expect(square(page, 'd4')).toHaveAttribute('aria-label', /White pawn/); await expect(page.locator('.manual-arrow')).toHaveCount(0);
  await expect(page.locator('.variation-banner')).toBeVisible();
});

test('touch annotation mode, two-tap arrows, highlights and eraser lock piece moves', async ({ page }) => {
  await open(page); await (await tool(page, /^Annotate/)).tap();
  await touchDrag(page, 'e2', 'e4'); await expect(page.locator('.manual-arrow')).toHaveCount(1); await expect(counter(page)).toHaveText('0');
  await square(page, 'd4').tap(); await expect(square(page, 'd4').locator('.square-mark')).toHaveCount(1);
  await (await tool(page, 'Two-tap arrow tool: choose the start, then the destination')).tap();
  await square(page, 'b1').tap(); await square(page, 'c3').tap(); await expect(page.locator('.manual-arrow')).toHaveCount(2);
  await (await tool(page, 'Eraser: remove annotations touching a square')).tap(); await square(page, 'c3').tap(); await expect(page.locator('.manual-arrow')).toHaveCount(1);
  await (await tool(page, 'Clear annotations for this position')).tap(); await expect(page.locator('.manual-arrow')).toHaveCount(0);
  await expect(counter(page)).toHaveText('0'); await expect(square(page, 'e2')).toHaveAttribute('aria-label', /White pawn/);
});

test('touch promotion picker and expanded navigation remain accessible', async ({ page }) => {
  await open(page); await importText(page, '7k/P7/8/8/8/8/8/6K1 w - - 0 1', 'FEN position');
  await square(page, 'a7').tap(); await square(page, 'a8').tap(); await page.getByRole('button', { name: 'Promote to knight', exact: true }).tap();
  await expect(square(page, 'a8')).toHaveAttribute('aria-label', /White knight/);
  await (await tool(page, 'Expand board into focus view')).tap(); await expect(page.locator('.navigation-bar')).toBeVisible();
  await page.getByRole('button', { name: 'First position (Home)', exact: true }).tap(); await expect(counter(page)).toHaveText('0');
  await page.getByRole('button', { name: 'Exit focus view', exact: true }).tap();
});

test('phone review, player coaching and engine continuation navigation are functional', async ({ page }) => {
  await open(page); await importText(page, '1. f3 e5 2. g4 Qh4# 0-1');
  await tab(page, 'Moves');
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await tab(page, 'Insights'); await advancedReview(page); await expect(page.locator('.personal-coach')).toBeVisible();
  await page.getByRole('combobox', { name: 'Choose player for personalized coaching', exact: true }).selectOption('b'); await expect(page.locator('.personal-coach')).toHaveText(/Black/);
  await page.getByRole('combobox', { name: 'Choose player for personalized coaching', exact: true }).selectOption('w');
  await page.locator('.critical-actions button').filter({ hasText: 'Compare engine line' }).first().tap();
  await expect(page.getByRole('grid')).toBeVisible(); await expect(page.locator('.variation-banner')).toBeVisible();
  await fs.mkdir('artifacts/screenshots', { recursive: true }); await page.screenshot({ path: 'artifacts/screenshots/mobile-variation.png', fullPage: true });
});

test('320px, phone landscape and tablet layouts have no horizontal overflow', async ({ page }) => {
  await open(page);
  for (const viewport of [{ width: 320, height: 640 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    const size = await page.evaluate(() => ({ window: innerWidth, page: document.documentElement.scrollWidth, board: document.querySelector('.chessboard').getBoundingClientRect().toJSON() }));
    expect(size.page, `${viewport.width}px page width`).toBeLessThanOrEqual(size.window);
    expect(Math.abs(size.board.width - size.board.height)).toBeLessThan(1);
  }
});
