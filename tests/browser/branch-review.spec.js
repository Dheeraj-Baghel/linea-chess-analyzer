import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { clickMove, collectErrors, counter, currentFen, originalPgn, square, start, openTools, closeTools, guidedReview, shortPgn, matePgn } from './helpers.js';

const output = process.env.LINEA_BRANCH_PRODUCTION === '1' ? 'artifacts/testing/compact-return/production' : 'artifacts/testing/compact-return/development';
test.beforeEach(async () => fs.mkdir(output, { recursive: true }));
const card = page => page.getByRole('region', { name: 'Live variation move review' });
async function ready(page) { await expect(card(page)).toHaveAttribute('data-review-status', 'complete', { timeout: 35000 }); }
async function load(page, value, fen = false) {
  // Import/review workflows are not homepage-animation benchmarks. Use the
  // supported reduced-motion path so unrelated video/3D load cannot consume
  // the dialog's actionability budget on this shared development machine.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Review my game', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: fen ? 'Game link / FEN' : 'PGN game', exact: true }).first().click();
  if (fen) await dialog.getByRole('button', { name: 'FEN position', exact: true }).click();
  await dialog.locator('#import-text').fill(value);
  if (!fen) await dialog.getByRole('combobox', { name: 'PGN player to focus on' }).selectOption('w');
  await dialog.getByRole('button', { name: fen ? 'Load position' : 'Load game', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  if (!fen) await guidedReview(page);
}
async function savedReview(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('linea-library'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = db.transaction('reviews').objectStore('reviews').getAll(); request.onsuccess = () => resolve(request.result[0]?.snapshot || null); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  });
}
async function traceWorkers(page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker; window.__branchWorkers = [];
    window.Worker = class extends NativeWorker {
      constructor(url, options) { super(url, options); this.evidence = { url: String(url), commands: [], messages: [] }; window.__branchWorkers.push(this.evidence); this.addEventListener('message', event => this.evidence.messages.push(String(event.data))); }
      postMessage(command, ...rest) { this.evidence.commands.push(String(command)); return super.postMessage(command, ...rest); }
    };
  });
}
async function scan(page, name) {
  const result = await new AxeBuilder({ page }).include('.analysis-layout').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await fs.writeFile(`${output}/axe-${name}.json`, JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2));
  expect(result.violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => node.target) }))).toEqual([]);
}

// Real local Stockfish: these workflows do not mock engine messages or scores.
test('alternate moves receive inline engine feedback and return to the exact original branch point', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const pgn = await originalPgn(page);
  await page.getByRole('button', { name: /^Go to 2… Nc6(,|$)/ }).click();
  const originalPosition = await currentFen(page);
  await clickMove(page, 'd2', 'd4');
  await expect(page.locator('.variation-banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Return to game', exact: true })).toHaveCount(1);
  await expect(page.locator('.review-panel-heading .branch-return-button')).toBeVisible();
  await expect(page.locator('#analysis-board .branch-return-button')).toHaveCount(0);
  const size = await page.locator('.branch-return-button').boundingBox();
  expect(size.width).toBeLessThan(180); expect(size.height).toBeLessThanOrEqual(44);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const feedback = page.getByRole('region', { name: 'Live variation move review' });
  await expect(feedback).toBeVisible();
  await expect(feedback.locator('[data-feedback-type]')).toBeVisible({ timeout: 25000 });
  await expect(page.locator('.board-feedback')).toBeVisible();
  await expect(square(page, 'd4')).toHaveAttribute('aria-label', /, (Book|Forced|Brilliant|Great|Best|Excellent|Good|Inaccuracy|Mistake|Miss|Blunder) move/);
  await expect(page.locator('.board-feedback')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: `${output}/desktop-live-branch.png`, fullPage: true });
  await scan(page, 'desktop-branch');
  expect(await originalPgn(page)).toBe(pgn);
  await page.getByRole('button', { name: 'Return to game', exact: true }).click();
  await expect(page.locator('.variation-banner')).toHaveCount(0);
  await expect(counter(page)).toHaveText('4');
  expect(await currentFen(page)).toBe(originalPosition);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(counter(page)).toHaveText('5');
  await expect(square(page, 'b5')).toHaveAttribute('aria-label', /White bishop/);
  expect(await originalPgn(page)).toBe(pgn);
  expect(errors).toEqual([]);
});

test('an interrupted running original review resumes in the same generation without branch contamination', async ({ page }) => {
  await traceWorkers(page); await load(page, shortPgn);
  await expect.poll(async () => (await savedReview(page))?.running).toBe(true);
  const generation = (await savedReview(page)).generation.id;
  await page.getByRole('button', { name: /^Go to 1… e5(,|$)/ }).click();
  await clickMove(page, 'd2', 'd4');
  await expect.poll(async () => (await savedReview(page))?.generation.status).toBe('paused');
  const frozen = await savedReview(page);
  await ready(page); const during = await savedReview(page);
  expect(during.records).toEqual(frozen.records); expect(during.generation.id).toBe(generation);
  expect(during.done).toBe(frozen.done);
  await page.getByRole('button', { name: 'Return to game', exact: true }).click();
  await expect(counter(page)).toHaveText('2');
  await expect.poll(async () => (await savedReview(page))?.generation.resumeCount).toBe(1);
  await expect.poll(async () => (await savedReview(page))?.generation.status, { timeout: 40000 }).toBe('completed');
  const after = await savedReview(page);
  expect(after.generation.id).toBe(generation); expect(after.done).toBe(8);
  for (const [ply, record] of Object.entries(frozen.records)) expect(after.records[ply]).toEqual(record);
  expect(Object.values(after.records).every(record => record.provenance.scope !== 'variation')).toBe(true);
  expect(await originalPgn(page)).toBe(shortPgn);
  const workers = await page.evaluate(() => window.__branchWorkers);
  // Entering during engine startup/between searches needs no UCI stop. Native
  // acknowledgement during an active search is separately asserted by unit tests.
  expect(workers).toHaveLength(1);
  expect(workers[0].commands.filter(command => command.startsWith('position fen ')).some(command => command.endsWith('e2e4 e7e5 d2d4'))).toBe(true);
  await fs.writeFile(`${output}/native-review-handoff.json`, JSON.stringify({ frozen, after, workers }, null, 2));
});

test('completed original scores, evidence and PGN remain byte-equivalent across exploration', async ({ page }) => {
  await load(page, matePgn);
  await expect.poll(async () => (await savedReview(page))?.generation.status, { timeout: 40000 }).toBe('completed');
  const before = await savedReview(page);
  await page.getByRole('button', { name: /^Go to 1… e5(,|$)/ }).click();
  await clickMove(page, 'g2', 'g3'); await ready(page);
  await card(page).getByRole('button', { name: 'Explain this move' }).click();
  await expect(card(page).getByText('Branch ply / mover', { exact: true })).toBeAttached();
  expect(await savedReview(page)).toEqual(before);
  await page.getByRole('button', { name: /^Go to 1… e5(,|$)/ }).click();
  await expect(page.locator('.variation-banner')).toHaveCount(0);
  expect(await savedReview(page)).toEqual(before); expect(await originalPgn(page)).toBe(matePgn);
});

test('rapid moves, backward navigation and branch rewrites show only the selected move feedback', async ({ page }) => {
  await traceWorkers(page); await start(page);
  await page.getByRole('button', { name: 'First position (Home)', exact: true }).click();
  await clickMove(page, 'd2', 'd4'); await clickMove(page, 'd7', 'd5'); await clickMove(page, 'c2', 'c4');
  await ready(page); await expect(card(page).locator('.gr-move-label')).toHaveText('2. c4');
  await expect(square(page, 'c4')).toHaveAttribute('aria-label', / move$/);
  await card(page).getByRole('button', { name: /^Explore 1\. d4,/ }).click(); await ready(page);
  await expect(card(page).locator('.gr-move-label')).toHaveText('1. d4');
  await clickMove(page, 'g8', 'f6'); await ready(page);
  await expect(card(page).locator('.gr-move-label')).toHaveText('1… Nf6');
  await expect(page.locator('.variation-moves')).not.toHaveText(/d5|c4/);
  await page.getByRole('button', { name: 'Previous move in review', exact: true }).click();
  await ready(page); await expect(card(page).locator('.gr-move-label')).toHaveText('1. d4');
  await page.getByRole('button', { name: 'Review: next move', exact: true }).click();
  await ready(page); await expect(card(page).locator('.gr-move-label')).toHaveText('1… Nf6');
  expect(await page.evaluate(() => window.__branchWorkers.length)).toBe(1);
});

test('phone board exposes inline feedback and an accessible return without opening a popup', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page, '8/8/8/8/8/2R3p1/2pk2P1/7K w - - 0 1', true);
  await clickMove(page, 'c3', 'c2');
  const summary = page.getByRole('region', { name: 'Variation move feedback' });
  await expect(summary.locator('[data-feedback-type="brilliant"]')).toBeVisible({ timeout: 35000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.board-feedback')).toHaveCSS('opacity', '1');
  const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.screenshot({ path: `${output}/phone-branch-feedback.png`, fullPage: true });
  await scan(page, 'phone-board');
  await summary.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(card(page).locator('[data-feedback-type="brilliant"]')).toBeVisible();
  await scan(page, 'phone-details');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Return to game', exact: true })).toHaveCount(1);
  await expect(page.locator('.review-panel-heading .branch-return-button')).toBeVisible();
  await page.screenshot({ path: `${output}/phone-right-panel-return.png`, fullPage: true });
  await page.getByRole('button', { name: 'Return to game', exact: true }).click();
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await expect(square(page, 'c3')).toHaveAttribute('aria-label', /White rook/);
  await expect(page.locator('.variation-banner')).toHaveCount(0);
});

test('unavailable ownership shows Retry and no invented rating; retry recovers the same board', async ({ page }) => {
  await load(page, '8/8/8/8/8/2R3p1/2pk2P1/7K w - - 0 1', true);
  // Real Web Lock contention, not an invented engine error or mocked UCI score.
  await page.evaluate(() => new Promise(resolve => {
    navigator.locks.request('linea-stockfish-job-owner', async () => {
      const hold = new Promise(release => { window.__releaseBranchLock = release; });
      resolve(); await hold;
    });
  }));
  await clickMove(page, 'c3', 'c2');
  await expect(card(page)).toHaveAttribute('data-review-status', 'error');
  await expect(card(page).locator('[data-feedback-type]')).toHaveCount(0);
  await expect(page.locator('.board-feedback')).toHaveCount(0);
  await expect(card(page)).toContainText('Another Linea tab');
  await card(page).getByRole('button', { name: 'Retry move review', exact: true }).click();
  await expect(card(page)).toHaveAttribute('data-review-status', 'error');
  await page.evaluate(() => window.__releaseBranchLock());
  await card(page).getByRole('button', { name: 'Retry move review', exact: true }).click();
  await ready(page); await expect(card(page).locator('[data-feedback-type="brilliant"]')).toBeVisible();
  await page.getByRole('button', { name: 'Return to game', exact: true }).click();
  await expect(square(page, 'c3')).toHaveAttribute('aria-label', /White rook/);
});

test('explicit position analysis and its cancellation do not deadlock live branch review', async ({ page }) => {
  await start(page); await page.getByRole('button', { name: 'First position (Home)', exact: true }).click();
  await clickMove(page, 'd2', 'd4');
  const tools = await openTools(page);
  await tools.getByRole('button', { name: 'Resume position analysis', exact: true }).click();
  await expect(tools.locator('.engine-status')).toHaveText(/Analyzing|Search complete/, { timeout: 15000 });
  await tools.getByRole('button', { name: 'Pause position analysis', exact: true }).click();
  await closeTools(page); await ready(page);
  await expect(card(page).locator('.gr-move-label')).toHaveText('1. d4');
  await page.getByRole('button', { name: 'Return to game', exact: true }).click();
  await expect(counter(page)).toHaveText('0');
});

test('a manually paused game stays paused when returning from a reviewed branch', async ({ page }) => {
  await load(page, shortPgn);
  const tools = await openTools(page);
  await tools.getByRole('button', { name: /^Pause review/ }).click();
  await expect.poll(async () => (await savedReview(page))?.generation.status).toBe('paused');
  const frozen = await savedReview(page); await closeTools(page);
  await clickMove(page, 'd2', 'd4'); await ready(page);
  await page.getByRole('button', { name: 'Return to game', exact: true }).click();
  await page.waitForTimeout(500);
  expect(await savedReview(page)).toEqual(frozen);
});

test('restored branch drafts are re-reviewed without storing alternate labels as original results', async ({ page }) => {
  await load(page, '8/8/8/8/8/2R3p1/2pk2P1/7K w - - 0 1', true);
  const pgn = await originalPgn(page);
  await clickMove(page, 'c3', 'c2'); await ready(page);
  expect(await savedReview(page)).toBeNull();
  await page.reload(); await expect(square(page, 'c2')).toHaveAttribute('aria-label', /White rook/);
  await ready(page); await expect(card(page).locator('[data-feedback-type="brilliant"]')).toBeVisible();
  expect(await savedReview(page)).toBeNull(); expect(await originalPgn(page)).toBe(pgn);
  await page.getByRole('button', { name: 'Return to game', exact: true }).click();
  await expect(square(page, 'c3')).toHaveAttribute('aria-label', /White rook/);
});
