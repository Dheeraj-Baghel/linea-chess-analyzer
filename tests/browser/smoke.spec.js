import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import { advancedReview } from './helpers.js';

// Real application and Stockfish worker; no engine or board mocks in these checks.
test('desktop opens the real board and completes local engine evaluation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/sample');
  await expect(page).toHaveTitle(/Linea/);
  await expect(page.getByRole('heading', { name: 'Ruy Lopez · an open-ended study', level: 1 })).toBeVisible();
  await expect(page.locator('.workspace-heading, .workspace-mark')).toHaveCount(0);
  await expect(page.getByRole('gridcell')).toHaveCount(64);
  await advancedReview(page); await page.getByRole('button', { name: 'Resume position analysis', exact: true }).click();
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  await expect(page.locator('.engine-evaluation strong')).toHaveText(/^[+\u2212]?\d+\.\d{2}$|^[+\u2212]M\d+$/);
  await expect(page.locator('.candidate-line')).toHaveCount(1);
  await expect(page.locator('.engine-arrow')).toHaveCount(1);
  const state = await page.evaluate(() => ({
    title: document.title, width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    board: document.querySelector('.chessboard').getBoundingClientRect().toJSON(),
    eval: document.querySelector('.engine-evaluation').innerText,
    topLeft: document.querySelector('.square')?.getAttribute('data-square'),
    topLeftTheme: document.querySelector('.square')?.className,
  }));
  await fs.mkdir('artifacts/screenshots', { recursive: true });
  await fs.mkdir('artifacts/testing', { recursive: true });
  await page.screenshot({ path: 'artifacts/screenshots/desktop-initial.png', fullPage: true });
  await fs.writeFile('artifacts/testing/initial-smoke.json', JSON.stringify({ ...state, errors }, null, 2));
  expect(errors).toEqual([]);
  expect(state.scrollWidth).toBeLessThanOrEqual(state.width);
});

test('an optional Google Fonts outage does not block the board or real local engine', async ({ page }) => {
  const pageErrors = [], requestFailures = [], consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url });
  });
  // This test deliberately exercises the actual optional-resource failure path;
  // all other default tests serve empty font CSS without contacting Google.
  await page.route('https://fonts.googleapis.com/**', route => route.abort('internetdisconnected'));
  await page.goto('/sample');
  await expect(page.getByRole('gridcell')).toHaveCount(64);
  await advancedReview(page); await page.getByRole('button', { name: 'Resume position analysis', exact: true }).click();
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  await expect(page.locator('.engine-arrow')).toHaveCount(1);
  await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click();
  await expect(page.locator('.move-counter strong')).toHaveText('29');
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  await expect(page.locator('.engine-error')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toHaveLength(1);
  expect(requestFailures[0].url).toMatch(/^https:\/\/fonts\.googleapis\.com\//);
  expect(consoleErrors.every(error => error.url.startsWith('https://fonts.googleapis.com/'))).toBe(true);
});

test.describe('mobile smoke', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test('mobile opens the board and switches between all workspace views', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/sample');
    await expect(page.getByRole('gridcell')).toHaveCount(64);
    await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: 'Moves', exact: true }).tap();
    await expect(page.locator('.compact-notation')).toBeVisible();
    await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: /Insights/ }).tap();
    await advancedReview(page); await expect(page.locator('.personal-coach')).toBeVisible();
    await expect(page.locator('.engine-card')).toBeVisible();
    await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: 'Board', exact: true }).tap();
    await expect(page.getByRole('grid')).toBeVisible();
    const size = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    await fs.mkdir('artifacts/screenshots', { recursive: true });
    await page.screenshot({ path: 'artifacts/screenshots/mobile-initial.png', fullPage: true });
    expect(errors).toEqual([]);
    expect(size.scrollWidth).toBeLessThanOrEqual(size.width);
  });
});
