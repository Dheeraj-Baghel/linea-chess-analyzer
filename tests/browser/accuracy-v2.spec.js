import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { importText, matePgn, originalPgn, start, advancedReview } from './helpers.js';

const output = 'artifacts/testing/product-evolution/final/accuracy-regressions';
const images = 'artifacts/screenshots/product-evolution/accuracy-regressions';
test.beforeEach(async () => { await fs.mkdir(output, { recursive: true }); await fs.mkdir(images, { recursive: true }); });

test('accuracy v2 actual Stockfish scenarios, common-root search and policy variability', async ({ page }) => {
  // Fourteen real-engine fixtures, three policies on selected disputed cases.
  // Dedicated benchmark budget; normal workflow timeouts remain unchanged.
  test.setTimeout(180000);
  await start(page);
  const historical = await fs.readFile('tests/fixtures/kasparov-topalov-1999-prefix.pgn', 'utf8');
  const sacrifice = await fs.readFile('tests/fixtures/stockfish19-drawing-sacrifice.pgn', 'utf8');
  const longEndgame = await fs.readFile('tests/fixtures/accuracy-v2-long-endgame.pgn', 'utf8');
  const evidence = await page.evaluate(async ({ historical, sacrifice, longEndgame }) => {
    const [{ createReviewSession }, { parseGame }, { accuracySummary }, { LocalEngine }, { experimentalGameRatings }] = await Promise.all([import('/src/reviewSession.js'), import('/src/chess.js'), import('/src/accuracy.js'), import('/src/engine.js'), import('/src/gameRating.js')]);
    const fixtures = [
      ['short-loss', '[White "Fixture White"]\n[Black "Fixture Black"]\n\n1. f3 e5 2. g4 Qh4# 0-1'],
      ['Black-start-mate', '[SetUp "1"]\n[FEN "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 34"]\n\n34... Qh4# 0-1'],
      ['White-mate', '[SetUp "1"]\n[FEN "7k/8/5KQ1/8/8/8/8/8 w - - 0 1"]\n\n1. Qg7# 1-0'],
      ['underpromotion', '[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=N 1/2-1/2'],
      ['endgame', '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/P7/K7 w - - 0 1"]\n\n1. a4 Kg7 2. Ka2 Kf6 *'],
      ['en-passant', '1. e4 a6 2. e5 d5 3. exd6 *'],
      ['castling', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O *'],
      ['history-repetition', '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. e4 *'],
      ['forced-Black', '[SetUp "1"]\n[FEN "7k/8/6K1/8/8/8/8/7R b - - 0 34"]\n\n34... Kg8 *'],
      ['missed-mate', '1. f3 e5 2. g4 Nc6 *'],
      ['stalemate', '[SetUp "1"]\n[FEN "7k/8/5KQ1/8/8/8/8/8 w - - 0 1"]\n\n1. Qf7 1/2-1/2'],
      ['long-losing-endgame', longEndgame],
      ['verified-sacrifice', sacrifice],
      ['historical-reference-prefix', historical],
    ];
    const results = [];
    for (const [name, pgn] of fixtures) {
      const qualities = ['short-loss', 'verified-sacrifice', 'historical-reference-prefix'].includes(name) ? ['quick', 'balanced', 'deeper'] : ['balanced'];
      for (const quality of qualities) {
        const game = parseGame(pgn), session = createReviewSession(); session.setGame(game); session.setQuality(quality);
        const began = performance.now(); await session.start(); const state = session.getSnapshot(); session.dispose();
        results.push({ name, quality, pgn, elapsedMs: Math.round(performance.now() - began), summary: accuracySummary(game, state.records, state.generation?.id), ratings: experimentalGameRatings(game, state), state });
      }
    }
    // Native restricted search with original history: no fake UCI scores.
    const engine = new LocalEngine(); await engine.ready;
    const game = parseGame('1. f3 e5 *'), position = `position fen ${game.initialFen} moves f2f3 e7e5`, fen = game.positions.at(-1);
    const best = await engine.analyze({ fen, position, depth: 18, ms: 2200, multiPv: 1 });
    const played = await engine.analyze({ fen, position, depth: 18, ms: 2200, multiPv: 1, searchMoves: ['g2g4'] }); engine.dispose();
    return { results, restricted: { position, best, played } };
  }, { historical, sacrifice, longEndgame });
  await fs.writeFile(`${output}/native-benchmark.json`, JSON.stringify(evidence, null, 2));
  for (const result of evidence.results) {
    expect(result.state.error, `${result.name}/${result.quality}`).toBe('');
    expect(result.state.done).toBe(result.state.total); expect(result.state.generation.accuracyVersion).toBe('linea-accuracy-2');
    for (const record of Object.values(result.state.records)) {
      expect(record.accuracy).toBeGreaterThanOrEqual(0); expect(record.accuracy).toBeLessThanOrEqual(100);
      if (record.type === 'best') expect(record.loss).toBeLessThanOrEqual(1);
      if (record.type === 'brilliant') expect(record.sacrificeCheck.status).toBe('verified');
      if (record.recheck) { expect(record.recheck.best.multiPv).toBe(1); expect(record.recheck.played.multiPv).toBe(1); expect(record.recheck.played.searchMoves).toEqual([record.provenance.uci]); }
    }
    if (result.name === 'short-loss') { expect(result.state.records[3].loss).toBeGreaterThan(15); expect(result.summary.w.accuracy).toBeLessThan(result.summary.b.accuracy); }
    if (result.name === 'White-mate') expect(result.state.records[1].after).toMatchObject({ winner: 'w', mate: 0, source: 'rules' });
    if (result.name === 'Black-start-mate') expect(result.summary.w.total).toBe(0);
    if (result.name === 'history-repetition') { expect(result.state.positions[8].source).toBe('engine'); expect(result.state.positions[8].claims.threefold).toBe(true); }
    if (result.name === 'forced-Black') expect(result.state.records[1].type).toBe('forced');
    if (result.name === 'missed-mate') { expect(result.state.records[4].loss).toBeGreaterThan(7); expect(result.state.records[4].type).toBe('miss'); }
    if (result.name === 'stalemate') expect(result.state.records[1].after).toMatchObject({ reason: 'stalemate', source: 'rules', cp: 0 });
    if (result.name === 'long-losing-endgame') { expect(result.ratings.w.value).toBeGreaterThanOrEqual(100); expect(result.ratings.b.value).toBeGreaterThanOrEqual(100); expect(result.ratings.w.calibrated).toBe(false); }
    if (result.name === 'verified-sacrifice') expect(result.state.records[1].type).toBe('brilliant');
  }
  expect(evidence.restricted.played.lines[0].pv[0]).toBe('g2g4');
  expect(evidence.restricted.played.lines[0].mate).toBeLessThan(0);
  expect(evidence.restricted.best.lines[0].pv[0]).not.toBe('g2g4');
});

test('review evidence download, eleven labels, experimental Elo and mobile accessibility', async ({ page }) => {
  await start(page); await importText(page, matePgn);
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await advancedReview(page);
  await expect(page.locator('.review-breakdown tbody tr')).toHaveCount(11);
  await page.getByText('Experimental game Elo estimate', { exact: true }).click();
  await expect(page.locator('.experimental-game-rating')).toHaveText(/Uncalibrated.*Unavailable/);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download review evidence (JSON)' }).click();
  const file = await download; const path = await file.path(); const evidence = JSON.parse(await fs.readFile(path, 'utf8'));
  expect(evidence.originalPgn).toBe(matePgn); expect(evidence.accuracy.modelVersion).toBe('linea-accuracy-2');
  expect(evidence.experimentalGameElo.w.calibrated).toBe(false); expect(evidence.records).toHaveLength(4);
  await fs.writeFile(`${output}/downloaded-review.json`, JSON.stringify(evidence, null, 2));
  expect(await originalPgn(page)).toBe(matePgn);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 768) await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: /Insights/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    await fs.writeFile(`${output}/axe-${width}.json`, JSON.stringify({ violations: scan.violations, incomplete: scan.incomplete }, null, 2));
    expect(scan.violations).toEqual([]); await page.screenshot({ path: `${images}/report-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const pgn = await fs.readFile('tests/fixtures/accuracy-v2-long-endgame.pgn', 'utf8');
  await importText(page, pgn.trim());
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await advancedReview(page);
  await page.getByText('Experimental game Elo estimate', { exact: true }).click();
  await expect(page.locator('.experimental-game-rating')).toHaveText(/White: \d+.*Black: \d+/);
  await page.locator('.experimental-game-rating').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${images}/experimental-rating.png`, fullPage: true });
});
