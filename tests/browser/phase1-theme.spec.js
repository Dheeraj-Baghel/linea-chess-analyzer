import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { clickMove, counter, currentFen, importText, originalPgn, shortPgn, square, start, advancedReview, guidedReview } from './helpers.js';

const screenshots = 'artifacts/screenshots/phase1';
const evidence = 'artifacts/testing/phase1';
test.beforeEach(async () => { await fs.mkdir(screenshots, { recursive: true }); await fs.mkdir(evidence, { recursive: true }); });

async function dimensions(page) {
  return page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    return { width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth, header: rect('.app-header'), board: rect('.chessboard'), evaluation: rect('.eval-track'), transport: rect('.navigation-bar'), shell: rect('.workspace') };
  });
}
async function scan(page, name) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await fs.writeFile(`${evidence}/axe-${name}.json`, JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2));
  expect(result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
}

test('L02 compact desktop shell, exact theme tokens and unchanged native engine', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page, { pause: false });
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  await expect(page.locator('.chessboard')).toHaveClass(/theme-neutral/);
  await expect(page.locator('.workspace-heading, .workspace-mark')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ruy Lopez · an open-ended study', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /Threat|Threads|Scan history/i })).toHaveCount(0);
  const size = await dimensions(page);
  expect(size.header.height).toBeGreaterThanOrEqual(56);
  expect(size.header.height).toBeLessThanOrEqual(64);
  expect(size.board.width).toBeGreaterThanOrEqual(480);
  expect(size.board.width).toBeLessThanOrEqual(680);
  expect(Math.abs(size.evaluation.height - size.board.height)).toBeLessThan(1);
  expect(size.transport.bottom).toBeLessThanOrEqual(900);
  expect(size.pageWidth).toBeLessThanOrEqual(1440);
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(16, 17, 16)');
  await expect(page.locator('.button.primary').first()).toHaveCSS('background-color', 'rgb(245, 207, 73)');
  await expect(page.locator('.move-entry.current')).toHaveCSS('color', 'rgb(22, 24, 15)');
  const smallText = await page.locator('.game-meta, .player-rating, .engine-status, .depth-label, .accuracy-coverage, .moves-footer').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent.trim(), font: parseFloat(getComputedStyle(node).fontSize) })));
  expect(smallText.every(item => item.font >= 12)).toBe(true);
  await page.screenshot({ path: `${screenshots}/desktop-1440.png`, fullPage: true });
  await fs.writeFile(`${evidence}/desktop-layout.json`, JSON.stringify({ ...size, smallText }, null, 2));
});

test('L02 responsive theme has no overflow and preserves visible mobile import/settings', async ({ page }) => {
  await start(page);
  const results = [];
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 1600, height: 900 }, { width: 1920, height: 1080 }, { width: 844, height: 390 }, { width: 1440, height: 650 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const size = await dimensions(page); results.push(size);
    expect(size.pageWidth, `page overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(size.width);
    expect(Math.abs(size.board.width - size.board.height)).toBeLessThan(1);
    expect(Math.abs(size.evaluation.height - size.board.height)).toBeLessThan(1);
    expect(size.shell.width).toBeLessThanOrEqual(1440);
    await expect(page.getByRole('button', { name: 'Import game', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Display settings', exact: true })).toBeVisible();
    if (viewport.width === 390) {
      const controls = await page.locator('.header-actions button, .board-toolbar button, .navigation-bar button').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => ({ label: node.getAttribute('aria-label') || node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
      expect(controls.every(control => control.width >= 44 && control.height >= 44), JSON.stringify(controls)).toBe(true);
      await page.screenshot({ path: `${screenshots}/mobile-390.png`, fullPage: true });
    }
    await expect(counter(page)).toHaveText('28');
  }
  await fs.writeFile(`${evidence}/responsive-layouts.json`, JSON.stringify(results, null, 2));
});

test('L02 saved palettes migrate without changing board state, annotations, original PGN or worker/search identity', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('linea-display-v1', JSON.stringify({ theme: 'walnut', pieces: 'classic', coordinates: true, animation: false, sound: false, moveBadges: true }));
    window.__phase1Searches = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...rest) {
      if (typeof message === 'string' && message.startsWith('go ')) window.__phase1Searches.push(message);
      return post.call(this, message, ...rest);
    };
  });
  let workers = 0; page.on('worker', () => { workers++; });
  await start(page, { pause: false });
  await expect(page.locator('.chessboard')).toHaveClass(/theme-walnut/);
  await importText(page, shortPgn); await advancedReview(page);
  await page.getByRole('button', { name: 'Resume position analysis', exact: true }).click();
  await clickMove(page, 'd2', 'd4');
  await page.getByRole('button', { name: 'Rose annotation color', exact: true }).click();
  await square(page, 'c4').click();
  await expect(page.locator('.engine-status')).toHaveText('Search complete', { timeout: 30000 });
  const fen = await currentFen(page), beforeWorkers = workers;
  const searches = await page.evaluate(() => window.__phase1Searches.length);
  await page.getByRole('button', { name: 'Display settings', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Neutral', exact: true }).click();
  await dialog.getByRole('button', { name: 'Slate', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.chessboard')).toHaveClass(/theme-slate/);
  await expect(page.locator('.variation-banner')).toBeVisible();
  await expect(square(page, 'c4').locator('.square-mark')).toHaveCount(1);
  await expect(counter(page)).toHaveText('1');
  await expect(page.locator('.engine-status')).toHaveText('Search complete');
  expect(await currentFen(page)).toBe(fen);
  expect(await originalPgn(page)).toBe(shortPgn);
  expect(workers).toBe(beforeWorkers);
  expect(await page.evaluate(() => window.__phase1Searches.length)).toBe(searches);
  const stored = await page.evaluate(() => ({ current: JSON.parse(localStorage.getItem('linea-display-v2')), legacy: JSON.parse(localStorage.getItem('linea-display-v1')) }));
  expect(stored.current.theme).toBe('slate'); expect(stored.current.animation).toBe(false); expect(stored.legacy.theme).toBe('walnut');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(16, 17, 16)');
  await fs.writeFile(`${evidence}/preference-state-retention.json`, JSON.stringify({ workers, searches, stored, originalPgnPreserved: true, variationAndMarksPreserved: true }, null, 2));
});

test('L02 every classification stays legible on yellow selected moves', async ({ page }) => {
  await start(page);
  // Presentation-only fixtures mount the actual FeedbackBadge component. They
  // are explicitly labeled synthetic styles, never represented as engine review.
  await page.evaluate(async () => {
    const [{ default: React }, { default: ReactDOM }, { FeedbackBadge }, { FEEDBACK }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'), import('/src/Panels.jsx'), import('/src/chess.js'),
    ]);
    // Vite's CommonJS prebundles expose their React APIs through default exports.
    const { createElement: h } = React, { createRoot } = ReactDOM;
    const fixture = document.createElement('section'); fixture.id = 'phase1-classification-fixture';
    Object.assign(fixture.style, { padding: '24px', margin: '24px auto', maxWidth: '860px', background: 'var(--surface)', border: '1px solid var(--border)' });
    document.body.appendChild(fixture);
    createRoot(fixture).render(h('div', null,
      h('h2', { style: { fontSize: '18px', marginBottom: '16px' } }, 'Synthetic classification styles - not game analysis'),
      ...Object.keys(FEEDBACK).flatMap(type => [false, true].map(selected => h('button', { key: `${type}-${selected}`, className: `move-entry ${selected ? 'current' : ''}`, style: { width: '100%', marginBottom: '8px' }, 'data-category': type, 'data-selected': String(selected) }, h('span', null, 'Nf3'), h(FeedbackBadge, { record: { type }, text: true })))),
    ));
  });
  const fixture = page.locator('#phase1-classification-fixture');
  const categoryCount = await page.evaluate(async () => Object.keys((await import('/src/chess.js')).FEEDBACK).length);
  await expect(fixture.locator('.feedback-badge')).toHaveCount(categoryCount * 2);
  const colors = await fixture.locator('.move-entry').evaluateAll(nodes => {
    const rgb = color => color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = color => rgb(color).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const ratio = (fg, bg) => { const [a, b] = [lum(fg), lum(bg)].sort((a, b) => b - a); return (a + .05) / (b + .05); };
    const background = node => {
      for (let element = node; element; element = element.parentElement) {
        const value = getComputedStyle(element).backgroundColor;
        if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') return value;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    return nodes.map(node => {
      const badge = node.querySelector('.feedback-badge'), icon = node.querySelector('.feedback-icon');
      return { category: node.dataset.category, selected: node.dataset.selected, label: badge.textContent.trim(), notationRatio: ratio(getComputedStyle(node).color, background(node)), badgeRatio: ratio(getComputedStyle(badge).color, background(badge)), iconRatio: ratio(getComputedStyle(icon).color, background(icon)), badgeForeground: getComputedStyle(badge).color, badgeBackground: background(badge) };
    });
  });
  for (const row of colors) {
    expect(row.notationRatio, JSON.stringify(row)).toBeGreaterThanOrEqual(4.5);
    expect(row.badgeRatio, JSON.stringify(row)).toBeGreaterThanOrEqual(4.5);
    expect(row.iconRatio, JSON.stringify(row)).toBeGreaterThanOrEqual(4.5);
    expect(row.label).toBeTruthy();
  }
  await fixture.screenshot({ path: `${screenshots}/classification-style-fixture.png` });
  await fs.writeFile(`${evidence}/selected-move-contrast.json`, JSON.stringify(colors, null, 2));
});

test('L02 real reviewed selected move, graph, report and mobile insights stay accessible', async ({ page }) => {
  await start(page); await importText(page, '1. f3 e5 2. g4 Qh4# 0-1');
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible({ timeout: 40000 });
  await page.locator('.move-entry').nth(2).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await scan(page, 'reviewed-yellow-move');
  await page.screenshot({ path: `${screenshots}/reviewed-move.png`, fullPage: true });
  await guidedReview(page);
  await expect(page.locator('.review-chart polyline')).toHaveCSS('stroke', 'rgb(245, 207, 73)');
  await scan(page, 'desktop-report');
  await page.screenshot({ path: `${screenshots}/desktop-report.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('navigation', { name: 'Analysis workspace views' }).getByRole('button', { name: /Insights/ }).click();
  await scan(page, 'mobile-report');
  expect((await dimensions(page)).pageWidth).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${screenshots}/mobile-report.png`, fullPage: true });
});

test('L02 short-height keyboard dialogs preserve focus and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  for (const label of ['Display settings', 'Keyboard shortcuts and help (?)', 'Import game']) {
    const invoker = page.getByRole('button', { name: label, exact: true });
    await invoker.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(500);
    await expect(dialog).toHaveCSS('animation-name', 'none');
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press(i % 3 ? 'Tab' : 'Shift+Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]')))).toBe(true);
    }
    if (label === 'Display settings') await page.screenshot({ path: `${screenshots}/settings-short-height.png` });
    await page.keyboard.press('Escape'); await expect(invoker).toBeFocused();
  }
});
