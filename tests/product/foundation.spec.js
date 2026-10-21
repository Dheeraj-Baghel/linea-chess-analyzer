import { test, expect } from '../browser/fixtures.js';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { importText, matePgn, shortPgn, start, counter, originalPgn, advancedReview, guidedReview } from '../browser/helpers.js';

const output = 'artifacts/testing/product-evolution/final/foundation';
test.beforeEach(async ({ page }) => {
  await fs.mkdir(output, { recursive: true });
  await page.addInitScript(() => {
    const Native = window.Worker; window.__productWorkers = [];
    window.Worker = class extends Native {
      constructor(...args) { super(...args); const entry = { commands: [], terminated: false }; window.__productWorkers.push(entry); this.productEntry = entry; }
      postMessage(value, ...rest) { this.productEntry.commands.push(String(value)); super.postMessage(value, ...rest); }
      terminate() { this.productEntry.terminated = true; super.terminate(); }
    };
  });
});
async function saved(page) {
  return page.evaluate(async () => {
    const { createLibrary } = await import('/src/library.js'); const library = createLibrary();
    try { return { games: await library.listGames(), reviews: await library.all('reviews'), drafts: await library.all('drafts') }; } finally { library.close(); }
  });
}

test('real IndexedDB restores a finished native review, ply and evidence without another worker', async ({ page }) => {
  await start(page); expect(await page.evaluate(() => window.__productWorkers.length)).toBe(0);
  await importText(page, matePgn);
  await expect.poll(async () => (await saved(page)).games.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await guidedReview(page); await advancedReview(page);
  await page.locator('.chart-point').last().click(); await expect(counter(page)).toHaveText('4');
  const generation = await page.locator('.review-provenance').getAttribute('data-generation-id');
  await expect.poll(async () => (await saved(page)).reviews[0]?.snapshot.generation.status).toBe('completed');
  await page.reload(); await expect(page.getByText('Compatible saved evidence restored without recomputation.', { exact: true })).toBeVisible();
  await expect(counter(page)).toHaveText('4'); await advancedReview(page); await expect(page.locator('.review-provenance')).toHaveAttribute('data-generation-id', generation);
  expect(await page.evaluate(() => window.__productWorkers.length)).toBe(0); expect(await originalPgn(page)).toBe(matePgn);
  await fs.writeFile(`${output}/complete-restore.json`, JSON.stringify({ generation, restored: await saved(page), workerCountAfterReload: 0 }, null, 2));
});

test('pending review quality survives reload without relabelling or launching another generation', async ({ page }) => {
  await start(page); await importText(page, matePgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await advancedReview(page);
  const generation = await page.locator('.review-provenance').getAttribute('data-generation-id');
  await page.getByRole('combobox', { name: 'Game review quality', exact: true }).selectOption('deeper');
  await expect.poll(async () => (await saved(page)).drafts[0]?.value).toMatchObject({ quality: 'deeper', displayedQuality: 'balanced' });
  await page.reload(); await expect(page.getByText('Compatible saved evidence restored without recomputation.', { exact: true })).toBeVisible();
  await advancedReview(page);
  await expect(page.getByRole('combobox', { name: 'Game review quality', exact: true })).toHaveValue('deeper');
  await expect(page.locator('.review-policy-state')).toHaveText(/Pending: Deeper.*still use Balanced/);
  await expect(page.locator('.review-provenance')).toHaveAttribute('data-generation-id', generation); expect(await page.evaluate(() => window.__productWorkers.length)).toBe(0);
});

test('paused native review reloads with a safe checkpoint and an explicit history-aware resume', async ({ page }) => {
  await start(page); await importText(page, shortPgn); await advancedReview(page);
  await page.getByRole('combobox', { name: 'Game review quality', exact: true }).selectOption('deeper');
  await page.getByRole('button', { name: 'Rerun game review', exact: true }).click();
  await expect(page.locator('.move-entry .feedback-badge').first()).toBeAttached({ timeout: 30000 });
  await page.getByRole('button', { name: /^Pause review ·/ }).click();
  await expect.poll(async () => (await saved(page)).reviews.find(row => row.snapshot.generation.policy.id === 'deeper')?.snapshot.generation.status).toBe('paused');
  const before = (await saved(page)).reviews.find(row => row.snapshot.generation.policy.id === 'deeper').snapshot;
  await page.reload(); await expect(page.getByText('Saved review is paused. Resume when you are ready.', { exact: true })).toBeVisible();
  await advancedReview(page);
  expect(await page.evaluate(() => window.__productWorkers.length)).toBe(0);
  await page.getByRole('button', { name: 'Continue game review', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await expect.poll(async () => (await saved(page)).reviews.find(row => row.snapshot.generation.policy.id === 'deeper')?.snapshot.done).toBe(8);
  const after = (await saved(page)).reviews.find(row => row.snapshot.generation.policy.id === 'deeper').snapshot;
  expect(after.generation.id).toBe(before.generation.id); expect(after.records[1]).toEqual(before.records[1]);
  expect(after.generation.resumeCount).toBe(before.generation.resumeCount + 1);
  await fs.writeFile(`${output}/pause-resume.json`, JSON.stringify({ before, after }, null, 2));
});

test('live analysis deliberately pauses review and reuses the shared native worker', async ({ page }) => {
  await start(page); await importText(page, shortPgn); await advancedReview(page);
  await page.getByRole('combobox', { name: 'Game review quality', exact: true }).selectOption('deeper');
  await page.getByRole('button', { name: 'Rerun game review', exact: true }).click();
  await expect(page.locator('.move-entry .feedback-badge').first()).toBeAttached({ timeout: 30000 });
  await page.getByRole('button', { name: 'Resume position analysis', exact: true }).click();
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  await expect(page.locator('.review-policy-state')).toHaveText(/paused/);
  expect(await page.evaluate(() => window.__productWorkers.length)).toBe(1);
});

test('local game deletion and clear stop stale writes while preserving the open board', async ({ page }) => {
  await start(page); await importText(page, matePgn); await expect.poll(async () => (await saved(page)).games.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await page.getByRole('button', { name: 'Recent local games', exact: true }).click();
  await page.getByRole('button', { name: 'Delete saved Alice versus Bob', exact: true }).click();
  await page.getByRole('button', { name: 'Delete local data', exact: true }).click();
  await expect.poll(async () => (await saved(page)).games.length).toBe(0); expect((await saved(page)).reviews).toHaveLength(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.keyboard.press('ArrowRight'); await expect(counter(page)).toHaveText('1'); expect(await originalPgn(page)).toBe(matePgn);
  expect((await saved(page)).games).toHaveLength(0);
  await importText(page, shortPgn); await expect.poll(async () => (await saved(page)).games.length).toBe(1);
  await page.getByRole('button', { name: 'Recent local games', exact: true }).click();
  await page.getByRole('button', { name: 'Clear Linea local data', exact: true }).click(); await page.getByRole('button', { name: 'Delete local data', exact: true }).click();
  await expect.poll(async () => (await saved(page)).games.length).toBe(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click(); expect(await originalPgn(page)).toBe(shortPgn);
});

test('stale policy evidence stays saved but cannot populate a compatible review', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(async pgn => {
    const [{ createLibrary }, { parseGame }, { createReviewSession }] = await Promise.all([import('/src/library.js'), import('/src/chess.js'), import('/src/reviewSession.js')]);
    const library = createLibrary(), game = parseGame(pgn), record = await library.saveGame(game), review = createReviewSession();
    review.setGame(game); await review.start(); const snapshot = review.getSnapshot(); await library.saveCheckpoint(record.key, record.signature, snapshot); review.dispose();
    const row = (await library.all('reviews'))[0]; row.snapshot.generation.accuracyVersion = 'stale'; await library.put('reviews', row);
    const lookup = await library.getReview(record.key, record.signature, 'balanced'); const count = (await library.all('reviews')).length; library.close(); return { lookup, count };
  }, matePgn);
  expect(result.lookup).toBeNull(); expect(result.count).toBe(1);
});

test('quota-aborted checkpoint keeps completed in-memory results and exposes the failure', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    window.__failCheckpoint = true;
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'reviews' && window.__failCheckpoint) throw new DOMException('Storage quota injected for transaction regression', 'QuotaExceededError'); return put.apply(this, args); };
  });
  await start(page); await importText(page, matePgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await advancedReview(page);
  await expect(page.locator('.local-save-notice')).toHaveText(/quota/i); await expect(page.locator('.accuracy-coverage')).toHaveText(/Full game reviewed/);
  await expect(page.getByRole('button', { name: 'Download review evidence (JSON)' })).toBeEnabled(); expect(await originalPgn(page)).toBe(matePgn);
  await page.evaluate(() => { window.__failCheckpoint = false; });
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect.poll(async () => (await saved(page)).reviews[0]?.snapshot.generation.status).toBe('completed');
});

test('real IndexedDB additive upgrade retains records and blocked upgrades explain recovery', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(async pgn => {
    const [{ createLibrary }, { parseGame }] = await Promise.all([import('/src/library.js'), import('/src/chess.js')]);
    const name = 'linea-migration-test';
    const first = createLibrary({ name }); const record = await first.saveGame(parseGame(pgn)); first.close();
    const blocker = await new Promise((resolve, reject) => { const open = indexedDB.open(name, 1); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const upgrade = createLibrary({ name, schemaVersion: 2 });
    let message = ''; try { await upgrade.ready(); } catch (error) { message = error.message; }
    blocker.close(); await upgrade.retry(); const restored = await upgrade.getGame(record.key); upgrade.close(); return { message, restored, original: record.originalPgn };
  }, matePgn);
  expect(result.message).toMatch(/blocked by another/); expect(result.restored.originalPgn).toBe(result.original);
});

test('back and forward restore different local games without overwriting original PGNs', async ({ page }) => {
  await start(page); await importText(page, matePgn); await expect.poll(async () => (await saved(page)).games.length).toBe(1);
  await expect(page).toHaveURL(/\/review\//); const firstUrl = page.url();
  await importText(page, shortPgn); await expect.poll(async () => (await saved(page)).games.length).toBe(2);
  await expect.poll(() => page.url()).not.toBe(firstUrl);
  await page.goBack(); await expect(page).toHaveURL(firstUrl); await expect(page.getByRole('heading', { name: 'Checkmate regression' })).toBeVisible(); expect(await originalPgn(page)).toBe(matePgn);
  await page.goForward(); await expect(page.getByRole('heading', { name: 'Browser regression study' })).toBeVisible(); expect(await originalPgn(page)).toBe(shortPgn);
});

test('unsupported exclusive ownership is explicit, not an uncontrolled second engine', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }));
  await start(page); await importText(page, matePgn);
  await expect(page.getByRole('alert').filter({ hasText: 'Web Locks' }).first()).toBeVisible();
  expect(await page.evaluate(() => window.__productWorkers.length)).toBe(0); await expect(page.getByRole('gridcell')).toHaveCount(64);
});

test('native cross-tab job lock denies duplicate ownership even between searches', async ({ page, context }) => {
  await start(page);
  await page.evaluate(async () => { const { createEngineCoordinator } = await import('/src/engineCoordinator.js'); window.__heldCoordinator = createEngineCoordinator(); window.__heldClient = window.__heldCoordinator.createClient('review'); await window.__heldClient.ready; });
  const second = await context.newPage(); await second.goto('/');
  const message = await second.evaluate(async () => { const { createEngineCoordinator } = await import('/src/engineCoordinator.js'); const owner = createEngineCoordinator(); try { await owner.createClient('review').ready; return 'incorrectly acquired'; } catch (error) { return error.message; } finally { owner.dispose(); } });
  expect(message).toContain('Another Linea tab'); await page.evaluate(() => window.__heldCoordinator.dispose()); await second.close();
});

test('local library is accessible and fits desktop/phone without horizontal overflow', async ({ page }) => {
  await start(page); await importText(page, matePgn); await page.getByRole('button', { name: 'Recent local games', exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 }); await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); expect(result.violations).toEqual([]);
    await fs.writeFile(`${output}/axe-library-${width}.json`, JSON.stringify(result, null, 2)); await page.screenshot({ path: `${output}/library-${width}.png`, fullPage: true });
  }
});
