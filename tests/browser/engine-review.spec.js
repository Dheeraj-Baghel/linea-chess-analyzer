import { test, expect } from './fixtures.js';
import { Chess } from 'chess.js';
import fs from 'node:fs/promises';
import { ENGINE_BUILD } from '../../src/engineBuild.js';
import { FEEDBACK } from '../../src/chess.js';
import { collectErrors, counter, currentFen, importText, matePgn, originalPgn, shortPgn, square, start, advancedReview, guidedReview, resumeEngine } from './helpers.js';

// These checks use the actual vendored Stockfish WASM, not canned UCI scores.
test('one shared position/review worker reports the pinned Stockfish 19 Lite UCI identity without cross-origin isolation', async ({ page }) => {
  const errors = collectErrors(page), assets = [];
  page.on('response', response => {
    if (response.url().includes('/engine/')) assets.push({ url: response.url(), status: response.status(), type: response.headers()['content-type'] });
  });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__nativeEngineIdentity = [];
    // Observe real worker events without substituting commands, options or scores.
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        const record = { url: String(url), identity: null, threadOption: null, searches: 0 };
        window.__nativeEngineIdentity.push(record);
        this.addEventListener('message', event => {
          for (const line of String(event.data).split('\n')) {
            if (line.startsWith('id name ')) record.identity = line.slice(8);
            if (line.startsWith('option name Threads ')) record.threadOption = line;
            if (line.startsWith('bestmove ')) record.searches++;
          }
        });
      }
    };
  });
  await start(page, { pause: false });
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  await expect(page.locator('.engine-identity h3')).toContainText(ENGINE_BUILD.name);
  await expect(page.locator('.engine-identity h3')).toHaveAttribute('title', /19\.0\.1.*lite-single.*one thread/);
  await page.getByRole('button', { name: 'Pause position analysis', exact: true }).click();
  await importText(page, matePgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  const native = await page.evaluate(() => ({ engines: window.__nativeEngineIdentity, crossOriginIsolated }));
  expect(native.crossOriginIsolated).toBe(false);
  expect(native.engines).toHaveLength(1);
  for (const engine of native.engines) {
    expect(engine.url).toBe(ENGINE_BUILD.workerUrl);
    expect(engine.identity).toBe(ENGINE_BUILD.uciName);
    expect(engine.threadOption).toMatch(/default 1 min 1 max 1$/);
    expect(engine.searches).toBeGreaterThan(0);
  }
  expect(assets.some(asset => asset.url.endsWith(ENGINE_BUILD.wasmUrl) && asset.type.startsWith('application/wasm') && asset.status === 200)).toBe(true);
  expect(assets.every(asset => !asset.url.includes('stockfish-18'))).toBe(true);
  expect(await originalPgn(page)).toBe(matePgn);
  expect(errors).toEqual([]);
  await fs.mkdir('artifacts/testing/stockfish19', { recursive: true });
  await fs.mkdir('artifacts/screenshots/stockfish19', { recursive: true });
  await fs.writeFile('artifacts/testing/stockfish19/native-identity.json', JSON.stringify({ build: ENGINE_BUILD, native, assets }, null, 2));
  await advancedReview(page); await page.locator('.engine-card').screenshot({ path: 'artifacts/screenshots/stockfish19/engine-panel.png' });
});

test('real Stockfish evaluates, supports 3 candidate lines, pause/resume and separate engine arrows', async ({ page }) => {
  const errors = collectErrors(page); await start(page, { pause: false });
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  await page.getByRole('combobox', { name: 'Number of candidate lines', exact: true }).selectOption('3');
  await expect(page.locator('.candidate-line')).toHaveCount(3, { timeout: 20000 });
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 20000 });
  await page.getByRole('checkbox', { name: 'Candidates', exact: true }).check(); await expect(page.locator('.engine-arrow')).toHaveCount(3);
  await page.getByRole('checkbox', { name: 'Best-move arrow', exact: true }).uncheck(); await expect(page.locator('.engine-arrow')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Best-move arrow', exact: true }).check();
  await page.getByRole('button', { name: 'Pause position analysis', exact: true }).click();
  await expect(page.locator('.engine-status')).toHaveText('Paused');
  await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click();
  await expect(page.locator('.engine-evaluation strong')).toHaveText('—'); await expect(page.locator('.engine-arrow')).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume position analysis', exact: true }).click();
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 20000 });
  await expect(page.locator('.engine-arrow')).toHaveCount(3);
  await page.getByRole('button', { name: 'Pause position analysis', exact: true }).click();
  const prefix = Number(await counter(page).innerText());
  const original = await originalPgn(page), recorded = new Chess();
  recorded.loadPgn(original);
  // MultiPV rank is not a promise of divergence. The historical failing trace
  // chose 15...c5, exactly the recorded move, so normal navigation was correct.
  const candidates = page.locator('.candidate-line .pv-moves button:first-child');
  const moves = (await candidates.allTextContents()).map(text => text.replace(/^\d+[.\u2026]\s*/, ''));
  const alternative = moves.findIndex(san => san !== recorded.history()[prefix]);
  expect(alternative).toBeGreaterThanOrEqual(0);
  const expected = new Chess(await currentFen(page));
  expected.move(moves[alternative]);
  await candidates.nth(alternative).click();
  await expect(page.locator('.variation-banner')).toBeVisible();
  expect(Number(await counter(page).innerText())).toBe(1);
  await expect(page.locator('.variation-banner')).toHaveText(/Original game unchanged/);
  expect(await currentFen(page)).toBe(expected.fen());
  expect(await originalPgn(page)).toBe(original);
  await page.locator('.variation-banner').getByRole('button', { name: 'Return to game', exact: true }).click();
  await expect(counter(page)).toHaveText(String(prefix));
  expect(prefix).toBeGreaterThan(0); expect(errors).toEqual([]);
});

test('an actual engine candidate matching the recorded move navigates the mainline without a false variation', async ({ page }) => {
  await start(page); await importText(page, '1. e4 *');
  await resumeEngine(page);
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  await page.getByRole('button', { name: 'Pause position analysis', exact: true }).click();
  const candidate = page.locator('.candidate-line .pv-moves button').first();
  const san = (await candidate.innerText()).replace(/^\d+[.\u2026]\s*/, '');
  const original = `1. ${san} *`, expected = new Chess();
  expected.move(san);
  // Same initial position/settings reuse the real computed candidate while
  // paused. No UCI result or chess move is fabricated by this regression.
  await importText(page, original);
  await advancedReview(page);
  await expect(candidate).toHaveText(`1.${san}`);
  await candidate.click();
  await expect(counter(page)).toHaveText('1');
  await expect(page.locator('.variation-banner')).toHaveCount(0);
  expect(await currentFen(page)).toBe(expected.fen());
  expect(await originalPgn(page)).toBe(original);
});

test('real engine remains responsive through rapid navigation and keeps score bound to the current position', async ({ page }) => {
  const errors = collectErrors(page); await start(page, { pause: false });
  await importText(page, shortPgn);
  await resumeEngine(page);
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  await expect(counter(page)).toHaveText('3');
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  const fen = await currentFen(page), chess = new Chess(fen);
  const suggestion = page.locator('.candidate-line').first().getByRole('button').first();
  const text = await suggestion.innerText();
  expect(chess.turn()).toBe('b');
  chess.move(text.replace(/^\d+[.\u2026]\s*/, ''));
  await suggestion.click();
  expect(await currentFen(page)).toBe(chess.fen());
  expect(await originalPgn(page)).toBe(shortPgn);
  await expect(page.locator('.engine-error')).toHaveCount(0); expect(errors).toEqual([]);
});

test('full real-engine review yields genuine per-player accuracy, move feedback, coaching and chart navigation', async ({ page }) => {
  const errors = collectErrors(page); await start(page); await importText(page, matePgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await expect(page.locator('.move-entry .feedback-badge')).toHaveCount(4);
  await expect(page.locator('.accuracy-coverage')).toHaveText(/Full game reviewed/);
  await guidedReview(page); await advancedReview(page);
  await expect(page.locator('.personal-coach')).toHaveText(/Alice/);
  await expect(page.locator('.critical-moments')).toBeVisible();
  await page.getByRole('combobox', { name: 'Choose player for personalized coaching', exact: true }).selectOption('b');
  await expect(page.locator('.personal-coach')).toHaveText(/Bob/);
  await page.locator('.chart-point').last().click(); await expect(counter(page)).toHaveText('4');
  await expect(page.locator('.commentary-box')).toHaveText(/Qh4#/);
  await page.getByRole('combobox', { name: 'Choose player for personalized coaching', exact: true }).selectOption('w');
  await page.locator('.critical-position').first().click(); await expect(page.locator('.commentary-box')).toHaveText(/chance|Blunder|Inaccuracy/);
  await page.locator('.critical-actions button').filter({ hasText: 'Compare engine line' }).first().click();
  await expect(page.locator('.variation-banner')).toBeVisible();
  expect(await originalPgn(page)).toBe(matePgn);
  await page.locator('.variation-banner').getByRole('button', { name: 'Return to game' }).click();
  await page.getByRole('button', { name: 'Import game', exact: true }).click(); await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.screenshot({ path: 'artifacts/screenshots/review-coaching.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('review pause and resume preserves coverage and game replacement cancels old work', async ({ page }) => {
  const errors = collectErrors(page); await start(page); await importText(page, shortPgn);
  await expect(page.getByRole('button', { name: /\d+\/8 · Pause/ })).toBeVisible();
  await page.getByRole('button', { name: /\d+\/8 · Pause/ }).click();
  await expect(page.getByRole('button', { name: /Review game|Resume review/ })).toBeVisible();
  await page.getByRole('button', { name: /Review game|Resume review/ }).click();
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 45000 });
  await advancedReview(page);
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download review evidence (JSON)' }).click();
  const file = await downloaded; const evidence = JSON.parse(await fs.readFile(await file.path(), 'utf8'));
  // All moves must be processed/scored. A time-bounded native recheck can remain
  // provisional after an interrupted search; the UI must not call it final.
  for (const [index, color] of ['w', 'b'].entries()) {
    const side = evidence.accuracy[color];
    expect(side.reviewed).toBe(4); expect(side.scored).toBe(4); expect(side.total).toBe(4);
    if (!side.complete) expect(side.provisional).toBeGreaterThan(0);
    await expect(page.locator('.accuracy-player small').nth(index)).toHaveText(`4 / 4 moves · ${side.complete ? 'complete' : 'partial'}`);
  }
  await fs.mkdir('artifacts/testing/product-evolution/phase1', { recursive: true });
  await fs.writeFile('artifacts/testing/product-evolution/phase1/native-pause-coverage.json', JSON.stringify(evidence, null, 2));
  await importText(page, matePgn);
  await importText(page, '1. d4 d5 *');
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await advancedReview(page);
  const replacementDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download review evidence (JSON)' }).click();
  const replacement = JSON.parse(await fs.readFile(await (await replacementDownload).path(), 'utf8')); expect(replacement.originalPgn).toBe('1. d4 d5 *'); expect(replacement.records.map(move => move.uci)).toEqual(['d2d4', 'd7d5']);
  await expect(page.locator('.move-entry')).toHaveCount(2); expect(errors).toEqual([]);
});

for (const asset of ['js', 'wasm']) test(`real local engine ${asset} transport failure is explained and retry restores analysis without losing the board`, async ({ page }) => {
  // Fail only the transport fetch; never synthesize an engine result.
  const resource = `**${asset === 'js' ? ENGINE_BUILD.workerUrl : ENGINE_BUILD.wasmUrl}*`;
  await page.route(resource, route => route.abort());
  await page.goto('/sample'); await expect(page.getByRole('gridcell')).toHaveCount(64);
  await resumeEngine(page);
  await expect(page.locator('.engine-status')).toHaveText('Unavailable', { timeout: 40000 });
  await page.getByRole('button', { name: 'Next move (Right arrow)', exact: true }).click(); await expect(counter(page)).toHaveText('29');
  await page.unroute(resource); await page.getByRole('button', { name: 'Retry engine', exact: true }).click();
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  await expect(page.locator('.engine-error')).toHaveCount(0); await expect(counter(page)).toHaveText('29');
});

test('native Stockfish sacrifice evidence and Linea Brilliant classification use actual engine scores', async ({ page }) => {
  test.setTimeout(90000); await start(page);
  const result = await page.evaluate(async () => {
    const [{ LocalEngine }, { Chess }, model, review] = await Promise.all([import('/src/engine.js'), import('/node_modules/.vite/deps/chess__js.js'), import('/src/chess.js'), import('/src/review.js')]);
    const engine = new LocalEngine(); await engine.ready;
    // Constructed tactical regression position (not an attributed historical game).
    const fen = '5r1k/6pp/4Q2N/8/8/8/8/6K1 w - - 0 1';
    const beforeResult = await engine.analyze({ fen, depth: 18, ms: 6000 });
    const before = beforeResult.lines[0], chess = new Chess(fen);
    const raw = chess.move('Qg8+'), move = { ...raw, uci: model.toUci(raw), number: 1 };
    const afterResult = await engine.analyze({ fen: move.after, position: `position fen ${fen} moves ${move.uci}`, depth: 18, ms: 6000 });
    const after = afterResult.lines[0], record = model.classify(before, after, move), candidate = review.sacrificeCandidate(move, record);
    let accepted = null, final = record;
    if (candidate) {
      const data = await engine.analyze({ fen: candidate.fen, position: `position fen ${fen} moves ${move.uci} ${candidate.acceptance}`, depth: 18, ms: 6000 });
      accepted = data.lines[0]; final = review.withBrilliance(record, candidate, accepted, move);
    }
    engine.dispose();
    return { before, after, move: { san: move.san, uci: move.uci }, candidate, accepted, final };
  });
  await fs.mkdir('artifacts/testing', { recursive: true });
  await fs.writeFile('artifacts/testing/native-sacrifice.json', JSON.stringify(result, null, 2));
  expect(result.before.depth).toBeGreaterThanOrEqual(12);
  expect(result.after.depth).toBeGreaterThanOrEqual(12);
  expect(result.before.pv[0]).toBe('e6g8');
  // An already forced, high-advantage mate is intentionally excluded by Linea’s
  // nontrivial-sacrifice threshold. Native evidence must not be bent to force !!.
  expect(result.before.mate).toBe(2);
  expect(result.candidate).toBeNull();
  expect(result.final.type).toBe('best');
});

test('historical sacrifice follows Stockfish 19 Lite preference rather than inheriting the old engine label', async ({ page }) => {
  test.setTimeout(90000);
  const pgn = await fs.readFile('tests/fixtures/kasparov-topalov-1999-prefix.pgn', 'utf8');
  await start(page);
  const result = await page.evaluate(async pgn => {
    const [model, { LocalEngine }, review] = await Promise.all([import('/src/chess.js'), import('/src/engine.js'), import('/src/review.js')]);
    const game = model.parseGame(pgn), chess = model.positionChess(game, game.moves.length, null, 0), fen = chess.fen();
    const engine = new LocalEngine(); await engine.ready;
    const before = (await engine.analyze({ fen, depth: 20, ms: 10000 })).lines[0];
    const raw = chess.move('Rxd4'), move = { ...raw, uci: model.toUci(raw), number: 24 };
    const after = (await engine.analyze({ fen: move.after, position: `position fen ${fen} moves ${move.uci}`, depth: 20, ms: 10000 })).lines[0];
    const record = model.classify(before, after, move), candidate = review.sacrificeCandidate(move, record);
    const accepted = candidate ? (await engine.analyze({ fen: candidate.fen, position: `position fen ${fen} moves ${move.uci} ${candidate.acceptance}`, depth: 20, ms: 10000 })).lines[0] : null;
    const final = review.withBrilliance(record, candidate, accepted, move); engine.dispose();
    return { before, after, candidate, accepted, final, fen };
  }, pgn);
  await fs.writeFile('artifacts/testing/kasparov-sacrifice.json', JSON.stringify(result, null, 2));
  // Engine-version-specific regression: pinned 19.0.1 prefers Nc6, not Rxd4.
  // The old 18 fixture was Brilliant; retaining that label would fabricate evidence.
  expect(result.before.depth).toBe(20); expect(result.after.depth).toBe(20);
  expect(result.before.pv[0]).toBe('a5c6');
  expect(result.candidate).toBeNull(); expect(result.accepted).toBeNull();
  expect(result.final.type).toBe('excellent'); expect(result.final.brilliance).toBeNull();
});

test('historical full-game review UI truthfully shows the new engine classification', async ({ page }) => {
  test.setTimeout(120000);
  const prefix = await fs.readFile('tests/fixtures/kasparov-topalov-1999-prefix.pgn', 'utf8');
  const pgn = prefix.trim().replace(/\*$/, '24. Rxd4 *');
  await start(page); await importText(page, pgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 100000 });
  await page.locator('.move-entry').last().click();
  await guidedReview(page); await advancedReview(page);
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download review evidence (JSON)' }).click();
  const file = await downloaded, evidence = JSON.parse(await fs.readFile(await file.path(), 'utf8'));
  const last = evidence.records.at(-1), record = last.evidence, feedback = FEEDBACK[record.type]; expect(feedback).toBeTruthy();
  // Unlike the isolated fixed-depth comparison above, a time-bounded full-game
  // review may find a different best move. Require actual acceptance evidence,
  // not a hard-coded Excellent/Brilliant badge for this historical game.
  const verified = await page.evaluate(async ({ record, uci }) => {
    const { withBrilliance } = await import('/src/review.js');
    return Boolean(withBrilliance({ ...record, type: 'excellent' }, record.sacrificeCheck.candidate, record.sacrificeCheck.evaluation, { color: 'w', uci }).brilliance?.verified);
  }, { record, uci: last.uci });
  expect(record.type === 'brilliant').toBe(verified);
  await expect(page.locator('.move-entry').last()).toContainText(feedback.label);
  await expect(page.locator('.board-feedback')).toHaveText(feedback.icon);
  await expect(page.locator('.brilliant-evidence')).toHaveCount(verified ? 1 : 0);
  await expect(page.locator('.commentary-box')).toContainText('Rxd4');
  if (verified) { expect(record.sacrificeCheck.status).toBe('verified'); expect(record.sacrificeCheck.candidate.cost).toBeGreaterThanOrEqual(1.5); expect(record.loss).toBeLessThanOrEqual(1.5); expect(record.provisional).toBe(false); }
  expect(await originalPgn(page)).toBe(pgn);
  await fs.mkdir('artifacts/testing/product-evolution/phase1', { recursive: true });
  await fs.writeFile('artifacts/testing/product-evolution/phase1/historical-review-evidence.json', JSON.stringify(evidence, null, 2));
  await fs.mkdir('artifacts/screenshots/stockfish19', { recursive: true });
  await page.screenshot({ path: 'artifacts/screenshots/stockfish19/historical-review.png', fullPage: true });
});

test('Stockfish 19 independently validates a drawing sacrifice with before, after and accepting-capture searches', async ({ page }) => {
  const pgn = await fs.readFile('tests/fixtures/stockfish19-drawing-sacrifice.pgn', 'utf8');
  await start(page);
  const result = await page.evaluate(async pgn => {
    const [model, { LocalEngine }, review] = await Promise.all([import('/src/chess.js'), import('/src/engine.js'), import('/src/review.js')]);
    const game = model.parseGame(pgn), move = game.moves[0], engine = new LocalEngine();
    await engine.ready;
    try {
      const before = (await engine.analyze({ fen: game.initialFen, depth: 16, ms: 1100 })).lines[0];
      const after = (await engine.analyze({ fen: move.after, position: `position fen ${game.initialFen} moves ${move.uci}`, depth: 16, ms: 1100 })).lines[0];
      const base = model.classify(before, after, move), candidate = review.sacrificeCandidate(move, base);
      const accepted = candidate ? (await engine.analyze({ fen: candidate.fen, position: `position fen ${game.initialFen} moves ${move.uci} ${candidate.acceptance}`, depth: 16, ms: 1400 })).lines[0] : null;
      return { before, after, candidate, accepted, final: review.withBrilliance(base, candidate, accepted, move) };
    } finally { engine.dispose(); }
  }, pgn);
  await fs.mkdir('artifacts/testing/stockfish19', { recursive: true });
  await fs.writeFile('artifacts/testing/stockfish19/verified-drawing-sacrifice.json', JSON.stringify({ build: ENGINE_BUILD, pgn, ...result }, null, 2));
  expect(result.before.pv[0]).toBe('c3c2');
  expect(result.candidate).toMatchObject({ cost: 4, acceptance: 'd2c2', offeredPiece: 'r' });
  for (const evaluation of [result.before, result.after, result.accepted]) {
    expect(evaluation.depth).toBeGreaterThanOrEqual(12);
    expect(evaluation.mate).toBeNull(); expect(evaluation.cp).toBeGreaterThanOrEqual(-50);
  }
  expect(result.final.brilliance.verified).toBe(true);
  expect(result.final.type).toBe('brilliant');
});

test('actual game-review UI shows a native Stockfish 19 verified Brilliant without changing the heuristic', async ({ page }) => {
  // The existing import contract trims outer whitespace; submit a canonical
  // fixture string, then assert that exact supplied source is preserved.
  const pgn = (await fs.readFile('tests/fixtures/stockfish19-drawing-sacrifice.pgn', 'utf8')).trim();
  await start(page); await importText(page, pgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.move-entry')).toHaveText(/Rxc2\+\s*!!\s*Brilliant/);
  await page.locator('.move-entry').click(); await expect(page.locator('.board-feedback')).toHaveText('!!');
  await guidedReview(page); await advancedReview(page);
  await expect(page.locator('.brilliant-evidence')).toHaveText(/acceptance search depth 1[2-6]/);
  await expect(page.locator('.brilliant-moments')).toHaveText(/Rxc2\+/);
  expect(await originalPgn(page)).toBe(pgn);
  await fs.mkdir('artifacts/screenshots/stockfish19', { recursive: true });
  await page.screenshot({ path: 'artifacts/screenshots/stockfish19/brilliant-review.png', fullPage: true });
});
