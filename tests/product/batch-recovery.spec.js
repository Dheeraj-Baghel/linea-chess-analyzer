import { test, expect } from '../browser/fixtures.js';
import fs from 'node:fs/promises';
const pgn = '[White "Alice"]\n[Black "Bob"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
const row = id => ({ key: `chess.com:live:${id}`, provider: 'chess.com', id: String(id), url: `https://www.chess.com/game/live/${id}`, pgn, color: 'w', format: 'blitz', date: '2026-10-20T00:00:00Z' });
async function init(page) {
  await page.goto('/sample');
  await page.evaluate(async () => { const [{ createLibrary }, { createEngineCoordinator }, { createBatchReview }] = await Promise.all([import('/src/library.js'), import('/src/engineCoordinator.js'), import('/src/batchReview.js')]); window.__batchLibrary = createLibrary(); window.__batchCoordinator = createEngineCoordinator(); window.__batch = createBatchReview({ library: window.__batchLibrary, coordinator: window.__batchCoordinator }); });
}

test('actual ten-game sequential batch pauses, restores after reload and reuses checkpoints', async ({ page }) => {
  test.setTimeout(120000); await init(page);
  const key = await page.evaluate(async games => window.__batch.start({ provider: 'chesscom', username: 'alice', filter: 'all', games }, { quality: 'quick' }), Array.from({ length: 10 }, (_, i) => row(300 + i)));
  await expect.poll(() => page.evaluate(() => window.__batch.getSnapshot().report.processed), { timeout: 40000 }).toBeGreaterThan(0);
  const paused = await page.evaluate(async () => { await window.__batch.pause(); return structuredClone(window.__batch.getSnapshot()); });
  expect(paused.manifest.status).toBe('paused'); expect(paused.manifest.selectedGames).toHaveLength(10);
  const completedBefore = paused.manifest.selectedGames.filter(game => game.status === 'completed').map(game => game.snapshot.generation.id);
  await page.goto(`/player-report/${encodeURIComponent(key)}`); await expect(page.getByRole('button', { name: 'Resume batch', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume batch', exact: true }).click();
  await expect(page.locator('.player-report-metrics')).toContainText('10 / 10', { timeout: 80000 });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export player report', exact: true }).click();
  const evidence = JSON.parse(await fs.readFile(await (await download).path(), 'utf8')); expect(evidence.report.selected).toBe(10); expect(evidence.report.completed).toBe(10);
  for (const id of completedBefore) expect(evidence.manifest.selectedGames.some(game => game.snapshot.generation.id === id)).toBe(true);
  await fs.mkdir('artifacts/testing/product-evolution/final', { recursive: true }); await fs.writeFile('artifacts/testing/product-evolution/final/ten-game-resume.json', JSON.stringify(evidence, null, 2));
});

test('foreground ownership safely preempts native batch work, then explicitly resumes it', async ({ page }) => {
  await init(page); await page.evaluate(async games => { await window.__batch.start({ provider: 'chesscom', username: 'alice', filter: 'all', games }); }, [row(700), row(701)]);
  await expect.poll(() => page.evaluate(() => window.__batch.getSnapshot().progress?.ply ?? 0)).toBeGreaterThanOrEqual(1);
  await page.evaluate(async () => { const client = window.__batchCoordinator.createClient('position'); await client.ready; window.__foregroundClient = client; });
  await expect.poll(() => page.evaluate(() => window.__batch.getSnapshot().manifest.status)).toBe('paused');
  await page.evaluate(() => window.__foregroundClient.dispose());
  await page.evaluate(() => window.__batch.resume()); await expect.poll(() => page.evaluate(() => window.__batch.getSnapshot().report.completed), { timeout: 40000 }).toBe(2);
  await page.evaluate(() => { window.__batch.dispose(); window.__batchCoordinator.dispose(); window.__batchLibrary.close(); });
});

test('native batch cancellation preserves processed results and separate skipped denominators', async ({ page }) => {
  await init(page); await page.evaluate(async games => { await window.__batch.start({ provider: 'chesscom', username: 'alice', filter: 'all', games }, { quality: 'deeper' }); }, [row(810), row(811), row(812)]);
  await expect.poll(() => page.evaluate(() => window.__batch.getSnapshot().progress?.ply ?? 0)).toBeGreaterThanOrEqual(1);
  const result = await page.evaluate(async () => { await window.__batch.cancel(); const result = structuredClone(window.__batch.getSnapshot()); window.__batch.dispose(); window.__batchCoordinator.dispose(); window.__batchLibrary.close(); return result; });
  expect(result.manifest.status).toBe('cancelled'); expect(result.report.selected).toBe(3); expect(result.report.skipped).toBeGreaterThan(0); expect(result.report.distributionDenominator).toBe(result.report.completed * 2);
});
