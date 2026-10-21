// Captures v2 homepage screenshots and basic layout facts (CTA above fold, overflow).
// Usage: node scripts/capture-home.mjs [baseUrl] [outDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:4325';
const out = process.argv[3] || 'artifacts/screenshots/v2-homepage';
mkdirSync(out, { recursive: true });
const viewports = [['1366x768', 1366, 768], ['1440x900', 1440, 900], ['768x1024', 768, 1024], ['390x844', 390, 844]];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const results = [];
for (const [name, width, height] of viewports) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const facts = await page.evaluate(() => {
    const cta = [...document.querySelectorAll('.hero-copy .button.primary')][0]?.getBoundingClientRect();
    const badge = document.querySelector('.beta-badge')?.getBoundingClientRect();
    return { ctaBottom: cta && Math.round(cta.bottom), badgeTop: badge && Math.round(badge.top), innerHeight, overflowX: document.documentElement.scrollWidth - innerWidth, videos: document.querySelectorAll('video source').length };
  });
  await page.screenshot({ path: `${out}/home-${name}.png` });
  await page.screenshot({ path: `${out}/home-${name}-full.png`, fullPage: true });
  results.push({ name, ...facts, ctaAboveFold: facts.ctaBottom <= facts.innerHeight });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
