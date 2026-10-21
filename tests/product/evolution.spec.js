import { test, expect } from '../browser/fixtures.js';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

const pgn = '[Event "Product review fixture"]\n[White "Alice"]\n[Black "Bob"]\n[WhiteElo "1500"]\n[BlackElo "1600"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
const output = 'artifacts/testing/product-evolution/final';
async function importPgn(page) {
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page.getByRole('button', { name: 'PGN game', exact: true }).first().click();
  await page.locator('#import-text').fill(pgn); await page.getByRole('combobox', { name: 'PGN player to focus on' }).selectOption('w');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  await expect(page.locator('.accuracy-coverage')).toHaveText(/Full game reviewed/, { timeout: 40000 });
}
async function providerFixture(page) {
  const calls = [];
  await page.route('https://api.chess.com/pub/player/alice/games/**', async route => {
    const url = route.request().url(); calls.push(url);
    if (url.endsWith('/archives')) return route.fulfill({ json: { archives: ['https://api.chess.com/pub/player/alice/games/2026/09', 'https://api.chess.com/pub/player/alice/games/2026/10'] } });
    const count = url.endsWith('/10') ? 2 : 34;
    const games = Array.from({ length: count }, (_, index) => {
      const id = url.endsWith('/10') ? 1000 - index : 900 - index, black = index % 2 === 1;
      return { rules: 'chess', url: `https://www.chess.com/game/live/${id}`, pgn: black ? pgn.replace('[White "Alice"]', '[White "Bob"]').replace('[Black "Bob"]', '[Black "Alice"]') : pgn, white: { username: black ? 'Bob' : 'Alice', rating: 1500, result: 'checkmated' }, black: { username: black ? 'Alice' : 'Bob', rating: 1600, result: 'win' }, end_time: 1792000000 + id, time_class: index % 3 === 0 ? 'rapid' : 'blitz', time_control: '180', rated: true };
    });
    return route.fulfill({ json: { games } });
  });
  return calls;
}
test.beforeEach(async () => { await fs.mkdir(output, { recursive: true }); });

test('two-column overview, guided review, graph, branch and responsive geometry use native evidence', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: /Understand/ })).toBeVisible(); await importPgn(page);
  await expect(page.locator('.tool-rail, .report-column')).toHaveCount(0);
  await expect(page.locator('.accuracy-player strong')).toHaveCount(2);
  const before = await page.locator('.chessboard').boundingBox();
  await page.screenshot({ path: `${output}/overview-1440.png`, fullPage: true });
  await page.getByRole('button', { name: 'Start review', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided game review' })).toBeVisible();
  await page.locator('.chart-point').last().click(); await expect(page.locator('.move-counter strong')).toHaveText('4');
  await expect(page.locator('.commentary-box')).toContainText('Qh4#');
  await page.screenshot({ path: `${output}/guided-1440.png`, fullPage: true });
  await page.locator('.chart-point').nth(1).click(); await page.getByRole('button', { name: 'Explore alternative', exact: true }).click();
  await expect(page.locator('.variation-banner')).toBeVisible(); await page.locator('.variation-banner').getByRole('button', { name: 'Return to game' }).click();
  await page.getByText('Advanced analysis & evidence', { exact: true }).click();
  expect((await page.locator('.chessboard').boundingBox()).width).toBe(before.width);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await fs.writeFile(`${output}/axe-guided.json`, JSON.stringify(scan, null, 2)); expect(scan.violations).toEqual([]);
  const measurements = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); if (viewport.width < 768) await page.getByRole('button', { name: 'Board', exact: true }).click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await page.evaluate(() => { const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON(); return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, board: rect('.chessboard'), transport: rect('.navigation-bar') }; }); measurements.push(geometry);
    await fs.writeFile(`${output}/geometry-in-progress.json`, JSON.stringify(measurements, null, 2));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(viewport.width); expect(Math.abs(geometry.board.width - geometry.board.height)).toBeLessThan(1);
    if (viewport.width >= 1000) expect(geometry.transport.bottom).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: `${output}/review-${viewport.width}.png`, fullPage: true });
  }
  await fs.writeFile(`${output}/geometry.json`, JSON.stringify(measurements, null, 2));
});

test('public browser crosses months, browses 30 but freezes at most ten and runs a real mixed-color report', async ({ page }) => {
  const calls = await providerFixture(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await page.getByRole('button', { name: 'Import game', exact: true }).click(); await page.getByLabel('Chess.com username').fill('Alice'); await page.getByRole('button', { name: 'Find recent games', exact: true }).click();
  await expect(page.locator('.game-browser-row')).toHaveCount(10); expect(calls.filter(url => !url.endsWith('/archives'))).toHaveLength(2);
  await page.getByRole('button', { name: 'Load more · up to 30', exact: true }).click(); await expect(page.locator('.game-browser-row')).toHaveCount(20);
  await page.getByRole('button', { name: 'Load more · up to 30', exact: true }).click(); await expect(page.locator('.game-browser-row')).toHaveCount(30);
  const checkboxes = page.locator('.game-check input'); await checkboxes.nth(0).check(); await checkboxes.nth(1).check();
  await expect(page.getByRole('button', { name: 'Analyze selected (2)', exact: true })).toBeEnabled();
  await page.screenshot({ path: `${output}/games-browser.png`, fullPage: true });
  await page.getByRole('button', { name: 'Analyze selected (2)', exact: true }).click(); await expect(page).toHaveURL(/player-report/);
  await expect(page.locator('.player-report-metrics').first()).toContainText('2 / 2', { timeout: 45000 });
  await expect(page.locator('.player-report-metrics')).toContainText('1 W · 0 D · 1 L');
  await expect(page.locator('.quality-distribution')).toContainText('Best');
  const reportUrl = page.url(); await page.screenshot({ path: `${output}/player-report.png`, fullPage: true });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export player report', exact: true }).click();
  const evidence = JSON.parse(await fs.readFile(await (await download).path(), 'utf8'));
  expect(evidence.report.selected).toBe(2); expect(evidence.report.completed).toBe(2); expect(evidence.report.distributionDenominator).toBe(4);
  expect(evidence.report.games.map(game => game.color)).toEqual(['w', 'b']);
  await fs.writeFile(`${output}/mixed-color-report.json`, JSON.stringify(evidence, null, 2));
  await page.locator('.report-game').first().click(); await expect(page.locator('.review-panel')).toBeVisible();
  await page.getByRole('button', { name: '← Back to player report', exact: true }).click(); await expect(page).toHaveURL(reportUrl);
  await page.reload(); await expect(page.locator('.player-report-metrics')).toContainText('2 / 2');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); expect(scan.violations).toEqual([]); await fs.writeFile(`${output}/axe-player-report-${width}.json`, JSON.stringify(scan, null, 2));
    await page.screenshot({ path: `${output}/player-report-${width}.png`, fullPage: true });
  }
});

test('provider browsing selection is restored from IndexedDB after reload without another history request', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); const calls = await providerFixture(page); await page.goto('/');
  await page.getByRole('button', { name: 'Import game', exact: true }).click(); await page.getByLabel('Chess.com username').fill('Alice'); await page.getByRole('button', { name: 'Find recent games', exact: true }).click();
  await expect(page.locator('.game-browser-row')).toHaveCount(10); await page.locator('.game-check input').first().check();
  await expect(page.getByRole('button', { name: 'Analyze selected (1)', exact: true })).toBeVisible();
  await page.reload(); await expect(page.locator('.game-browser-row')).toHaveCount(10); await expect(page.locator('.game-check input').first()).toBeChecked(); expect(calls).toHaveLength(3);
});
