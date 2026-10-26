import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { currentFen, originalPgn } from './helpers.js';

const output = `artifacts/testing/explanation-relevance/${process.env.LINEA_EXPLANATIONS_PRODUCTION === '1' ? 'production' : 'development'}`;
const illustration = page => page.getByRole('region', { name: 'Engine illustration', exact: true });
const reviewCard = page => page.locator('.guided-review > .commentary-box');
async function evidence(page) {
  return page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('linea-library'); r.onsuccess = () => resolve(r.result); });
    try { return await new Promise(resolve => { const r = db.transaction('reviews').objectStore('reviews').getAll(); r.onsuccess = () => resolve(r.result[0]?.snapshot); }); } finally { db.close(); }
  });
}
const searches = page => page.evaluate(() => window.__relevanceWorkers.flatMap(worker => worker.commands.filter(command => command.startsWith('go '))));
async function load(page, pgn) {
  await page.addInitScript(() => { const Native = window.Worker; window.__relevanceWorkers = []; window.Worker = class extends Native { constructor(url, options) { super(url, options); this.commands = []; window.__relevanceWorkers.push(this); } postMessage(command, ...rest) { this.commands.push(String(command)); return super.postMessage(command, ...rest); } }; });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await page.getByRole('button', { name: 'Review my game', exact: true }).first().click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'PGN game', exact: true }).first().click();
  await dialog.locator('#import-text').fill(pgn); await dialog.getByRole('combobox', { name: 'PGN player to focus on' }).selectOption('w');
  await dialog.getByRole('button', { name: 'Load game', exact: true }).click();
  await expect.poll(async () => (await evidence(page))?.generation.status, { timeout: 45000 }).toBe('completed');
  await page.getByRole('button', { name: 'Start Game Review', exact: true }).click();
}
test.beforeEach(async () => fs.mkdir(output, { recursive: true }));

test('opening purposes are position-specific, short, and show their own pieces rather than the opponents reply', async ({ page }) => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 *'; await load(page, pgn);
  await page.getByRole('button', { name: /^Go to 1\. e4/ }).click();
  const before = await evidence(page), jobs = await searches(page), sourceFen = await currentFen(page);
  const text = await reviewCard(page).locator('.gr-text').innerText();
  expect(text).toContain('space in the centre'); expect(text).toContain('bishop'); expect(text).toContain('queen');
  expect(text).not.toMatch(/Stockfish prefers|search depth|captures/); expect(text.length).toBeLessThan(230);
  await expect(page.locator('.best-move-arrow[data-next-move-recommendation="true"]')).toHaveCount(1);
  await expect(page.locator('.next-move-hint')).toContainText('Best next move for Black');
  await expect(page.locator('[data-explanation-square="f1"]')).toHaveCount(1);
  await expect(page.locator('[data-explanation-square="d1"]')).toHaveCount(1);
  await expect(reviewCard(page).locator('.explanation-uncertainty')).toHaveCount(0);
  await page.screenshot({ path: `${output}/opening-purpose.png`, fullPage: true });
  await reviewCard(page).getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.locator('[data-fact-kind="opened-routes"][data-evidence-level="observable"]')).toBeVisible();
  await expect(page.getByText('Search limits and interpretation', { exact: true })).toBeVisible();
  await reviewCard(page).getByRole('button', { name: 'Show why', exact: true }).click();
  await expect(page.locator('.illustration-arrow')).toHaveCount(0);
  await page.keyboard.press('Home');
  await expect(page.locator('.illustration-arrow[data-explanation-kind="played"]')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await illustration(page).getByRole('button', { name: 'Follow continuation', exact: true }).click();
  await expect(page.locator('.illustration-arrow[data-explanation-kind="reply"]')).toHaveCount(1);
  await expect(illustration(page).locator('.illustration-view-label')).toContainText("opponent's suggested reply");
  expect(await searches(page)).toEqual(jobs); expect(await evidence(page)).toEqual(before);
  await page.getByRole('button', { name: 'Back to review', exact: true }).click(); expect(await currentFen(page)).toBe(sourceFen);
  await page.getByRole('button', { name: /^Go to 2\. Nf3/ }).click();
  const nextText = await reviewCard(page).locator('.gr-text').innerText();
  expect(nextText).not.toBe(text); expect(nextText).toContain('knight'); expect(nextText).toMatch(/d4|e5|engine prefers/);
  await expect(page.locator('.best-move-arrow[data-next-move-recommendation="true"]')).toHaveCount(1);
  expect(await originalPgn(page)).toBe(pgn);
  await fs.writeFile(`${output}/opening-examples.json`, JSON.stringify({ e4: text, Nf3: nextText, searchesUnchanged: true }, null, 2));
});

test('causal mistake comparison has separate legal played, alternative and reply visuals with unchanged evidence', async ({ page }) => {
  const pgn = '[SetUp "1"]\n[FEN "3qk3/8/8/3p4/8/8/8/3Q2K1 w - - 0 1"]\n\n1. Qxd5 *'; await load(page, pgn);
  await page.getByRole('button', { name: /^Go to 1\. Qxd5/ }).click();
  const before = await evidence(page), jobs = await searches(page), source = await currentFen(page);
  await expect(reviewCard(page).locator('.gr-text')).toContainText('queen on d5 to be taken');
  await expect(reviewCard(page).locator('.gr-text')).toContainText('avoids that immediate capture');
  await expect(page.locator('.best-move-arrow[data-next-move-recommendation="true"]')).toHaveCount(1);
  await expect(page.locator('.next-move-hint')).toContainText('Best next move for Black');
  await reviewCard(page).getByRole('button', { name: 'Show why', exact: true }).click();
  await illustration(page).getByRole('button', { name: 'Preferred alternative', exact: true }).click();
  await expect(page.locator('.illustration-arrow[data-explanation-kind="alternative"]')).toHaveCount(1);
  await expect(illustration(page).locator('.illustration-view-label')).toContainText('same before-position');
  expect(await currentFen(page)).toBe(before.records[1].before.fen);
  await page.keyboard.press('ArrowRight'); await expect(page.locator('.board-feedback')).toHaveCount(0);
  await page.screenshot({ path: `${output}/preferred-alternative.png`, fullPage: true });
  const axe = await new AxeBuilder({ page }).include('.analysis-layout').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await fs.writeFile(`${output}/axe-comparison.json`, JSON.stringify({ violations: axe.violations, incomplete: axe.incomplete }, null, 2));
  expect(axe.violations).toEqual([]);
  await illustration(page).getByRole('button', { name: 'Played move', exact: true }).click();
  await expect(page.locator('.illustration-arrow[data-explanation-kind="played"]')).toHaveCount(1);
  await page.keyboard.press('ArrowRight'); await illustration(page).getByRole('button', { name: 'Follow continuation', exact: true }).click();
  await expect(page.locator('.illustration-arrow[data-explanation-kind="reply"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to review', exact: true }).click(); expect(await currentFen(page)).toBe(source);
  expect(await searches(page)).toEqual(jobs); expect(await evidence(page)).toEqual(before); expect(await originalPgn(page)).toBe(pgn);
});
