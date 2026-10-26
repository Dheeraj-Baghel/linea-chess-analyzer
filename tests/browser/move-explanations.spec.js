import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { clickMove, currentFen, originalPgn, square, openTools, closeTools } from './helpers.js';
import { SAMPLE_PGN } from '../../src/chess.js';

const production = process.env.LINEA_EXPLANATIONS_PRODUCTION === '1';
const output = `artifacts/testing/move-explanations/${production ? 'production' : 'development'}`;
const forkPgn = '[Event "Constructed checking fork"]\n[SetUp "1"]\n[FEN "2q3k1/7p/8/5N2/8/8/8/6K1 w - - 0 1"]\n[Result "*"]\n\n1. Ne7+ *';
const shortPgn = '[Event "Local explanation workflow"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *';
const card = page => page.getByRole('region', { name: 'Engine illustration', exact: true });
const gameCard = page => page.locator('.guided-review > .commentary-box');
async function trace(page) {
  await page.addInitScript(() => {
    const Native = window.Worker; window.__explanationWorkers = [];
    window.Worker = class extends Native {
      constructor(url, options) { super(url, options); this.evidence = { url: String(url), commands: [] }; window.__explanationWorkers.push(this.evidence); }
      postMessage(command, ...rest) { this.evidence.commands.push(String(command)); return super.postMessage(command, ...rest); }
    };
  });
}
const jobs = page => page.evaluate(() => window.__explanationWorkers.flatMap(worker => worker.commands.filter(command => command.startsWith('go '))));
async function stored(page, store = 'reviews') {
  return page.evaluate(async store => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('linea-library'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  }, store);
}
const savedReview = async page => (await stored(page))[0]?.snapshot || null;
async function load(page, text, { fen = false, waitForReview = true } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await trace(page); await page.goto('/');
  await page.getByRole('button', { name: 'Review my game', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: fen ? 'Game link / FEN' : 'PGN game', exact: true }).first().click();
  if (fen) await dialog.getByRole('button', { name: 'FEN position', exact: true }).click();
  await dialog.locator('#import-text').fill(text);
  if (!fen) await dialog.getByRole('combobox', { name: 'PGN player to focus on' }).selectOption('w');
  await dialog.getByRole('button', { name: fen ? 'Load position' : 'Load game', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  if (!fen) {
    if (waitForReview) await expect.poll(async () => (await savedReview(page))?.generation.status, { timeout: 45000 }).toBe('completed');
    const start = page.getByRole('button', { name: 'Start Game Review', exact: true });
    if (await start.isVisible()) await start.click();
  }
}
async function scan(page, name) {
  const axe = await new AxeBuilder({ page }).include('.analysis-layout').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await fs.writeFile(`${output}/axe-${name}.json`, JSON.stringify({ violations: axe.violations, incomplete: axe.incomplete }, null, 2));
  expect(axe.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
}
test.beforeEach(async () => fs.mkdir(output, { recursive: true }));

test('actual Stockfish checking-fork evidence drives automatic explanation and search-free Show why playback', async ({ page }) => {
  await load(page, forkPgn);
  await page.getByRole('button', { name: /^Go to 1\. Ne7\+/ }).click();
  const before = await savedReview(page), searches = await jobs(page), position = await currentFen(page);
  await expect(gameCard(page).locator('.gr-text')).toContainText('attacks the queen');
  await gameCard(page).getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.locator('[data-fact-kind="checking-fork"]')).toBeVisible();
  await page.getByRole('button', { name: 'Show why', exact: true }).click();
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toBeFocused();
  const reason = await card(page).locator('.explanation-summary').innerText();
  await expect(card(page)).toContainText('Not the recorded game');
  await expect(card(page)).toHaveAttribute('data-illustration-step', '1');
  await expect(page.locator('.illustration-arrow')).toHaveCount(0);
  await expect(page.locator('[data-explanation-square="c8"]')).toHaveCount(1);
  await card(page).getByRole('button', { name: 'Follow continuation', exact: true }).click();
  await expect(page.locator('.illustration-arrow[data-explanation-kind="reply"]')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect(card(page)).toHaveAttribute('data-illustration-step', '2');
  await expect(page.locator('.board-feedback')).toHaveCount(0);
  await expect(card(page).locator('.explanation-summary')).toHaveText(reason);
  await card(page).getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(card(page)).toHaveAttribute('data-illustration-step', '0');
  await card(page).getByRole('button', { name: 'Pause illustration', exact: true }).click();
  await card(page).getByRole('button', { name: 'Illustration: next move', exact: true }).click();
  await expect(card(page)).toHaveAttribute('data-illustration-step', '1');
  const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.screenshot({ path: `${output}/checking-fork-illustration.png`, fullPage: true });
  await scan(page, 'desktop-illustration');
  expect(await jobs(page)).toEqual(searches); expect(await savedReview(page)).toEqual(before); expect(await originalPgn(page)).toBe(forkPgn);
  await page.getByRole('button', { name: 'Back to review', exact: true }).click();
  await expect(card(page)).toHaveCount(0); expect(await currentFen(page)).toBe(position);
  expect(await savedReview(page)).toEqual(before); expect(await jobs(page)).toEqual(searches);
  await fs.writeFile(`${output}/native-fork-and-preservation.json`, JSON.stringify({ before, after: await savedReview(page), searches, searchesAfter: await jobs(page), reason }, null, 2));
});

test('illustration preserves annotations and source draft; reload returns to review, not a reanalyzed branch', async ({ page }) => {
  await load(page, shortPgn); await page.getByRole('button', { name: /^Go to 2\. Nf3/ }).click();
  await square(page, 'e4').click({ button: 'right' }); await expect(square(page, 'e4').locator('.square-mark')).toHaveCount(1);
  await expect.poll(async () => (await stored(page, 'drafts'))[0]?.value.ply).toBe(3);
  const frozen = await savedReview(page), original = await currentFen(page), searches = await jobs(page);
  await page.getByRole('button', { name: 'Show why', exact: true }).click();
  await page.keyboard.press('End'); await expect(card(page)).toBeVisible();
  expect(await jobs(page)).toEqual(searches);
  const draft = (await stored(page, 'drafts'))[0].value;
  expect(draft.variation).toBeNull(); expect(draft.ply).toBe(3); expect(draft.illustration).toBeUndefined();
  await page.keyboard.press('Escape'); await expect(card(page)).toHaveCount(0);
  expect(await currentFen(page)).toBe(original); await expect(square(page, 'e4').locator('.square-mark')).toHaveCount(1);
  expect(await savedReview(page)).toEqual(frozen);
  await page.getByRole('button', { name: 'Show why', exact: true }).click(); await page.keyboard.press('ArrowRight');
  await page.reload(); await expect(page.getByRole('gridcell')).toHaveCount(64);
  await expect(page.getByRole('button', { name: 'Show why', exact: true })).toBeVisible();
  await expect(card(page)).toHaveCount(0); expect(await currentFen(page)).toBe(original);
  expect(await jobs(page)).toEqual([]); // compatible complete checkpoint restores without a worker
  expect(await originalPgn(page)).toBe(shortPgn);
});

test('a new player move explicitly exits illustration and enters the existing live exploration workflow', async ({ page }) => {
  await load(page, forkPgn); await page.getByRole('button', { name: /^Go to 1\. Ne7\+/ }).click();
  const frozen = await savedReview(page);
  await page.getByRole('button', { name: 'Show why', exact: true }).click();
  await clickMove(page, 'g8', 'h8');
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Live variation move review' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Return to game', exact: true })).toBeVisible();
  await expect(page.locator('.sr-only[aria-live]')).toContainText(/Illustration ended|Analysis line|Original game/);
  expect(await savedReview(page)).toEqual(frozen); expect(await originalPgn(page)).toBe(forkPgn);
});

test('exploration explanations reuse accepted branch records without searches on each playback step', async ({ page }) => {
  await load(page, '8/8/8/8/8/2R3p1/2pk2P1/7K w - - 0 1', { fen: true });
  await clickMove(page, 'c3', 'c2');
  const branch = page.getByRole('region', { name: 'Live variation move review' });
  await expect(branch).toHaveAttribute('data-review-status', 'complete', { timeout: 35000 });
  const before = await currentFen(page), searches = await jobs(page);
  await branch.getByRole('button', { name: 'Show why', exact: true }).click();
  await page.keyboard.press('End'); await expect(card(page)).toBeVisible();
  await page.getByRole('button', { name: 'Back to review', exact: true }).click();
  await expect(branch).toBeVisible(); expect(await currentFen(page)).toBe(before);
  expect(await jobs(page)).toEqual(searches); expect(await savedReview(page)).toBeNull();
});

test('mobile keeps the explanation visible with the board and accessible playback/return controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page, forkPgn); await page.getByRole('button', { name: 'Review', exact: true }).click();
  const start = page.getByRole('button', { name: 'Start Game Review', exact: true });
  if (await start.isVisible()) await start.click();
  await page.getByRole('button', { name: /^Go to 1\. Ne7\+/ }).click();
  const before = await savedReview(page), searches = await jobs(page);
  await page.getByRole('button', { name: 'Show why', exact: true }).click();
  const compact = page.getByRole('region', { name: 'Engine illustration on board', exact: true });
  await expect(compact).toBeVisible(); await expect(compact.locator('.explanation-summary')).toContainText('attacks the queen');
  await compact.getByRole('button', { name: 'Illustration: next move', exact: true }).click();
  await expect(compact).toHaveAttribute('data-illustration-step', '2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${output}/phone-illustration.png`, fullPage: true });
  await scan(page, 'phone-illustration');
  await expect(compact.getByRole('button', { name: 'Back to review', exact: true })).toBeVisible();
  await compact.getByRole('button', { name: 'Supporting facts', exact: true }).click();
  await expect(card(page)).toBeVisible(); await scan(page, 'phone-review');
  await page.getByRole('button', { name: 'Back to review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show why', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show why', exact: true }).click();
  await compact.getByRole('button', { name: 'Back to review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show why', exact: true })).toBeVisible();
  expect(await jobs(page)).toEqual(searches); expect(await savedReview(page)).toEqual(before);
});

test('mistake consequences and stronger alternatives are displayed from the accepted native record', async ({ page }) => {
  const pgn = '[Event "Defended capture example"]\n[SetUp "1"]\n[FEN "3qk3/8/8/3p4/8/8/8/3Q2K1 w - - 0 1"]\n[Result "*"]\n\n1. Qxd5 *';
  await load(page, pgn); await page.getByRole('button', { name: /^Go to 1\. Qxd5/ }).click();
  await expect(gameCard(page).locator('.gr-text')).toContainText('queen on d5 to be taken');
  await expect(gameCard(page).locator('.gr-text')).toContainText('avoids that immediate capture');
  await gameCard(page).getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.locator('.better-continuation')).toContainText('Engine preferred');
  const tools = await openTools(page); await expect(tools.getByRole('combobox', { name: 'Game review quality' })).toBeVisible(); await closeTools(page);
});

test('a Black checkmating move uses board mate evidence and a single-move illustration, not invented timeout coaching', async ({ page }) => {
  const pgn = '[Event "Black mate explanation"]\n[SetUp "1"]\n[FEN "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 34"]\n[Result "0-1"]\n\n34... Qh4# 0-1';
  await load(page, pgn); await page.getByRole('button', { name: /^Go to 34… Qh4#/ }).click();
  await expect(gameCard(page).locator('.gr-text')).toContainText('is checkmate');
  const before = await savedReview(page), searches = await jobs(page), position = await currentFen(page);
  expect(before.records[1].after.source).toBe('rules');
  await page.getByRole('button', { name: 'Show why', exact: true }).click();
  await expect(card(page)).toHaveAttribute('data-illustration-step', '1');
  await expect(card(page).getByRole('button', { name: 'Illustration: next move', exact: true })).toBeDisabled();
  await expect(page.locator('.illustration-arrow')).toHaveCount(0);
  await page.keyboard.press('Home'); await expect(card(page)).toHaveAttribute('data-illustration-step', '0');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape');
  expect(await currentFen(page)).toBe(position); expect(await savedReview(page)).toEqual(before); expect(await jobs(page)).toEqual(searches);
});

test('illustrating an accepted move does not pause, restart or replace a running foreground review', async ({ page }) => {
  await load(page, SAMPLE_PGN, { waitForReview: false });
  await page.getByRole('button', { name: /^Go to 1\. e4/ }).click();
  await expect(page.getByRole('button', { name: 'Show why', exact: true })).toBeVisible({ timeout: 25000 });
  const before = await savedReview(page); expect(before.running).toBe(true);
  await page.getByRole('button', { name: 'Show why', exact: true }).click();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
  await expect(card(page)).toBeVisible();
  const during = await savedReview(page);
  expect(during.running).toBe(true); expect(during.generation.id).toBe(before.generation.id); expect(during.generation.resumeCount).toBe(0);
  expect(during.records[1]).toEqual(before.records[1]); expect(during.done).toBeGreaterThanOrEqual(before.done);
  await page.getByRole('button', { name: 'Back to review', exact: true }).click();
  const after = await savedReview(page); expect(after.generation.id).toBe(before.generation.id); expect(after.generation.resumeCount).toBe(0);
  expect(after.records[1]).toEqual(before.records[1]); expect(await originalPgn(page)).toBe(SAMPLE_PGN);
  const tools = await openTools(page); await tools.getByRole('button', { name: /^Pause review/ }).click();
});
