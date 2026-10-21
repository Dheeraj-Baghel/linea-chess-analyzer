import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { REVIEW_POLICIES } from '../../src/reviewPolicy.js';
import { clickMove, counter, importText, matePgn, originalPgn, shortPgn, square, start, advancedReview, guidedReview } from './helpers.js';

// Accuracy v2 intentionally changes scoring version and adds bounded rechecks.
// Keep earlier Phase 4 delivery evidence separate from this regression rerun.
const output = 'artifacts/testing/product-evolution/final/review-regressions', images = 'artifacts/screenshots/product-evolution/review-regressions';
function policySearch(command, policy) {
  if ([`go depth ${policy.targetDepth} movetime ${policy.positionMs}`, `go depth ${policy.targetDepth} movetime ${policy.sacrificeMs}`].includes(command)) return true;
  const root = `go depth ${Math.min(24, policy.targetDepth + 2)} movetime ${policy.positionMs * 2}`;
  return command === root || new RegExp(`^${root} searchmoves [a-h][1-8][a-h][1-8][qrbn]?$`).test(command);
}
test.beforeEach(async () => { await fs.mkdir(output, { recursive: true }); await fs.mkdir(images, { recursive: true }); });
async function traceWorkers(page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__phase4Workers = [];
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.evidence = { url: String(url), commands: [], output: [], terminated: false };
        window.__phase4Workers.push(this.evidence);
        this.addEventListener('message', event => this.evidence.output.push(String(event.data)));
      }
      postMessage(command, ...rest) { this.evidence.commands.push(String(command)); return super.postMessage(command, ...rest); }
      terminate() { this.evidence.terminated = true; return super.terminate(); }
    };
  });
}
const jobs = page => page.evaluate(() => window.__phase4Workers.map(worker => ({ url: worker.url, searches: worker.commands.filter(command => command.startsWith('go ')) })));
const showReport = page => advancedReview(page);
const provenance = page => page.locator('.review-provenance');
async function scan(page, name) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await fs.writeFile(`${output}/axe-${name}.json`, JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2));
  expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
}
async function tableTotals(page) {
  return page.locator('.review-breakdown').evaluate(root => {
    const number = (row, color) => Number(root.querySelector(`${row} [data-color="${color}"]`).textContent);
    const categories = [...root.querySelectorAll('tbody tr')].map(row => ({ category: row.dataset.category, w: Number(row.querySelector('[data-color=w]').textContent), b: Number(row.querySelector('[data-color=b]').textContent) }));
    return { categories, w: { reviewed: number('[data-summary=reviewed]', 'w'), unreviewed: number('[data-summary=unreviewed]', 'w'), total: number('[data-summary=total]', 'w') }, b: { reviewed: number('[data-summary=reviewed]', 'b'), unreviewed: number('[data-summary=unreviewed]', 'b'), total: number('[data-summary=total]', 'b') } };
  });
}

test('F03 pending quality, panel toggles and position depth never relabel or rerun an existing review', async ({ page }) => {
  await traceWorkers(page); await start(page); await importText(page, matePgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await showReport(page); const generation = await provenance(page).getAttribute('data-generation-id');
  const baselineJobs = await jobs(page), scores = await page.locator('.accuracy-player strong').allTextContents();
  await expect(page.getByRole('combobox', { name: 'Game review quality', exact: true })).toHaveValue('balanced');
  await page.getByRole('combobox', { name: 'Game review quality', exact: true }).selectOption('deeper');
  await expect(page.locator('.review-policy-state')).toHaveText(/Pending: Deeper.*still use Balanced/);
  await expect(provenance(page)).toHaveAttribute('data-generation-id', generation); await expect(provenance(page)).toHaveAttribute('data-policy', 'balanced');
  expect(await page.locator('.accuracy-player strong').allTextContents()).toEqual(scores); expect(await jobs(page)).toEqual(baselineJobs);
  await page.getByRole('tab', { name: /^Moves/ }).click(); await showReport(page);
  await page.setViewportSize({ width: 1600, height: 900 }); await expect(page.getByRole('combobox', { name: 'Game review quality', exact: true })).toHaveValue('deeper');
  await expect(provenance(page)).toHaveAttribute('data-generation-id', generation); expect(await jobs(page)).toEqual(baselineJobs);
  await page.getByRole('button', { name: 'Resume position analysis', exact: true }).click();
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  const beforePositionChange = await jobs(page);
  await page.getByRole('combobox', { name: 'Target analysis depth', exact: true }).selectOption('12');
  await expect.poll(async () => (await jobs(page))[0].searches.length).toBe(beforePositionChange[0].searches.length + 1);
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  const separated = await jobs(page);
  expect(separated[0].searches.at(-1)).toBe('go depth 12 movetime 2600');
  expect(separated).toHaveLength(1);
  expect(separated[0].searches.slice(0, baselineJobs[0].searches.length)).toEqual(baselineJobs[0].searches);
  await expect(provenance(page)).toHaveAttribute('data-policy', 'balanced');
  await page.getByRole('button', { name: 'Rerun game review', exact: true }).click();
  await expect(provenance(page)).not.toHaveAttribute('data-generation-id', generation);
  await expect(provenance(page)).toHaveAttribute('data-policy', 'deeper');
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  const updatedJobs = await jobs(page); expect(updatedJobs).toHaveLength(1);
  const rerunCommands = updatedJobs[0].searches.slice(separated[0].searches.length);
  expect(rerunCommands.every(command => policySearch(command, REVIEW_POLICIES.deeper))).toBe(true);
  expect(rerunCommands).toContain('go depth 20 movetime 3000');
  await expect(page.getByRole('combobox', { name: 'Target analysis depth', exact: true })).toHaveValue('12');
  expect(await originalPgn(page)).toBe(matePgn);
  await fs.writeFile(`${output}/pending-and-position-separation.json`, JSON.stringify({ generation, baselineJobs, separated, updatedJobs, scores, originalPgnPreserved: true }, null, 2));
});

test('F03 each policy drives native before/after/acceptance searches and records actual depths and version hashes', async ({ page }) => {
  await traceWorkers(page); await start(page);
  const pgn = (await fs.readFile('tests/fixtures/stockfish19-drawing-sacrifice.pgn', 'utf8')).trim();
  const observed = await page.evaluate(async pgn => {
    const [{ createReviewSession }, { parseGame }, { REVIEW_POLICIES }] = await Promise.all([import('/src/reviewSession.js'), import('/src/chess.js'), import('/src/reviewPolicy.js')]);
    const outputs = [];
    for (const quality of Object.keys(REVIEW_POLICIES)) {
      const session = createReviewSession(); session.setGame(parseGame(pgn)); session.setQuality(quality); await session.start();
      outputs.push(session.getSnapshot()); session.dispose();
    }
    return outputs;
  }, pgn);
  const workerJobs = await jobs(page); const hashes = new Set(), generations = new Set();
  for (let index = 0; index < observed.length; index++) {
    const state = observed[index], policy = REVIEW_POLICIES[state.selectedQuality], record = state.records[1];
    expect(state.error).toBe(''); expect(state.generation.status).toBe('completed'); expect(state.generation.coverage).toMatchObject({ reviewed: 1, total: 1, complete: true });
    hashes.add(state.generation.game.signature); generations.add(state.generation.id);
    expect(state.generation.engine.version).toBe('19.0.1'); expect(state.generation.engine.wasmSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record.provenance.generationId).toBe(state.generation.id); expect(record.provenance.policy).toEqual(policy);
    expect(record.type).toBe('brilliant'); expect(record.sacrificeCheck.status).toBe('verified');
    for (const evaluation of [record.before, record.after, record.sacrificeCheck.evaluation]) {
      expect(evaluation.source).toBe('engine'); expect(evaluation.depth).toBeGreaterThanOrEqual(12); expect(evaluation.depth).toBeLessThanOrEqual(policy.targetDepth); expect(evaluation.targetDepth).toBe(policy.targetDepth);
    }
    expect(workerJobs[index].searches).toEqual([`go depth ${policy.targetDepth} movetime ${policy.positionMs}`, `go depth ${policy.targetDepth} movetime ${policy.positionMs}`, `go depth ${policy.targetDepth} movetime ${policy.sacrificeMs}`]);
  }
  expect(hashes.size).toBe(1); expect(generations.size).toBe(3);
  await fs.writeFile(`${output}/native-policy-evidence.json`, JSON.stringify({ observed, workerJobs }, null, 2));
});

test('F03 same-generation pause/resume preserves evidence and an active rerun rejects old callbacks', async ({ page }) => {
  await traceWorkers(page); await start(page);
  const prefix = await fs.readFile('tests/fixtures/kasparov-topalov-1999-prefix.pgn', 'utf8');
  await importText(page, prefix.trim()); await showReport(page);
  await page.getByRole('combobox', { name: 'Game review quality', exact: true }).selectOption('deeper');
  await page.locator('.review-quality').getByRole('button', { name: 'Rerun game review', exact: true }).click();
  await expect(page.locator('.move-entry .feedback-badge').first()).toBeAttached({ timeout: 30000 });
  const generation = await provenance(page).getAttribute('data-generation-id');
  await page.getByRole('button', { name: /^\d+\/46 · Pause$/ }).click();
  await expect(page.locator('.review-policy-state')).toHaveText(/Deeper · paused/);
  const saved = await page.locator('.move-entry .feedback-badge').allTextContents();
  await expect(page.locator('.accuracy-coverage')).toHaveText(/Partial review/);
  const pausedJobs = await jobs(page); await page.locator('.review-quality').getByRole('button', { name: 'Continue game review', exact: true }).click();
  await expect(provenance(page)).toHaveAttribute('data-generation-id', generation);
  expect((await jobs(page)).length).toBe(pausedJobs.length);
  const resumed = await page.locator('.move-entry .feedback-badge').allTextContents(); expect(resumed.slice(0, saved.length)).toEqual(saved);
  await page.getByRole('combobox', { name: 'Game review quality', exact: true }).selectOption('quick');
  await expect(provenance(page)).toHaveAttribute('data-policy', 'deeper');
  const rerunSearchStart = (await jobs(page))[0].searches.length;
  await page.getByRole('button', { name: 'Rerun game review', exact: true }).click();
  await expect(provenance(page)).not.toHaveAttribute('data-generation-id', generation); await expect(provenance(page)).toHaveAttribute('data-policy', 'quick');
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 60000 });
  await provenance(page).locator('summary').click(); await expect(provenance(page)).toHaveText(new RegExp(`Quick.*${REVIEW_POLICIES.quick.version}`));
  await expect(page.locator('.inline-error')).toHaveCount(0);
  const evidence = await page.evaluate(() => window.__phase4Workers); expect(evidence).toHaveLength(1); expect(evidence[0].terminated).toBe(false);
  expect(evidence[0].commands.filter(command => command.startsWith('go ')).slice(rerunSearchStart).every(command => policySearch(command, REVIEW_POLICIES.quick))).toBe(true);
  expect(await originalPgn(page)).toBe(prefix.trim());
  await fs.writeFile(`${output}/native-pause-rerun.json`, JSON.stringify({ generation, savedCount: saved.length, workerEvidence: evidence }, null, 2));
});

test('F04 every category totals by actual mover color including a Black-start FEN and exact mate', async ({ page }) => {
  await start(page);
  const pgn = '[Event "Black-start phase 4 regression"]\n[White "Fixture White"]\n[Black "Fixture Black"]\n[SetUp "1"]\n[FEN "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 34"]\n[Result "0-1"]\n\n34... Qh4# 0-1';
  await importText(page, pgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 30000 });
  await guidedReview(page); await page.locator('.move-entry').click(); await showReport(page);
  const totals = await tableTotals(page); expect(totals.w).toEqual({ reviewed: 0, unreviewed: 0, total: 0 }); expect(totals.b).toEqual({ reviewed: 1, unreviewed: 0, total: 1 });
  expect(totals.categories.reduce((sum, row) => sum + row.w + row.b, 0)).toBe(1);
  await page.locator('.move-review-evidence summary').click(); await expect(page.locator('.move-review-evidence')).toHaveText(/Exact checkmate; no search depth/);
  await provenance(page).locator('summary').click(); await expect(page.locator('.reached-position-depths')).toHaveText(/1 completed searches.*1 rules-derived outcomes/);
  expect(totals.w.reviewed).toBe(0);
  expect(await originalPgn(page)).toBe(pgn);
  await fs.writeFile(`${output}/black-start-totals.json`, JSON.stringify(totals, null, 2));
  await scan(page, 'black-start-report');
});

test('F04 partial counts, full totals and provenance remain accessible across report layouts', async ({ page }) => {
  await start(page); await importText(page, shortPgn); await showReport(page);
  const empty = await tableTotals(page); expect(empty.w.total).toBe(4); expect(empty.b.total).toBe(4);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  const full = await tableTotals(page); expect(full.w).toEqual({ reviewed: 4, total: 4, unreviewed: 0 }); expect(full.b).toEqual({ reviewed: 4, total: 4, unreviewed: 0 });
  expect(full.categories.reduce((sum, row) => sum + row.w, 0)).toBe(4); expect(full.categories.reduce((sum, row) => sum + row.b, 0)).toBe(4);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await provenance(page).locator('summary').click();
  for (const width of [1440, 1600, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 768) await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: /Insights/ }).click();
    await expect(page.getByRole('combobox', { name: 'Game review quality', exact: true })).toHaveValue('balanced');
    expect(await tableTotals(page)).toEqual(full);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1440) {
      const pageBounds = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, flow: Math.max(innerHeight, document.body.getBoundingClientRect().height) }));
      expect(pageBounds.scroll, 'Report evidence/accessibility labels must stay inside its scrollport').toBeLessThanOrEqual(Math.ceil(pageBounds.flow) + 4);
    }
    await scan(page, `report-${width}`);
    if (width >= 1440) await page.locator('.review-breakdown').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${images}/report-${width}.png`, fullPage: true });
  }
  await fs.writeFile(`${output}/category-totals.json`, JSON.stringify({ empty, full }, null, 2));
});

test('F03 rerun preserves original PGN, board branch and manual marks; replacement clears review provenance', async ({ page }) => {
  await start(page); await importText(page, matePgn); await clickMove(page, 'd2', 'd4');
  await page.getByRole('button', { name: 'Rose annotation color', exact: true }).click(); await square(page, 'c4').click();
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 30000 });
  await showReport(page); const oldGeneration = await provenance(page).getAttribute('data-generation-id'); await page.getByRole('combobox', { name: 'Game review quality', exact: true }).selectOption('quick');
  await page.getByRole('button', { name: 'Rerun game review', exact: true }).click(); await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.variation-banner')).toBeVisible(); await expect(counter(page)).toHaveText('1'); await expect(square(page, 'c4').locator('.square-mark')).toHaveCount(1); expect(await originalPgn(page)).toBe(matePgn);
  await importText(page, shortPgn); await showReport(page); await expect(provenance(page)).not.toHaveAttribute('data-generation-id', oldGeneration);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download review evidence (JSON)' }).click();
  const value = JSON.parse(await fs.readFile(await (await download).path(), 'utf8')); expect(value.originalPgn).toBe(shortPgn); expect(value.records.map(move => move.uci)).toHaveLength(8);
  const totals = await tableTotals(page); expect(totals.w.total).toBe(4); expect(totals.b.total).toBe(4);
});
