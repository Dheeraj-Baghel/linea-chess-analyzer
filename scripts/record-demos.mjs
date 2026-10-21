// Records homepage demo clips from the dev-only /demo-record views and encodes them.
// Requires the dev server (npm run dev) and ffmpeg (Homebrew). Usage:
//   node scripts/record-demos.mjs [--frames] [clip...]
// --frames only writes keyframe PNGs for visual review (no video).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs';

const BASE = process.env.LINEA_BASE || 'http://127.0.0.1:4325';
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const OUT = 'public/previews', TMP = 'artifacts/demo-recording';
// id, view, duration (s), size, poster second, keyframes (s)
const CLIPS = [
  { id: 'brilliant-review-loop', view: 'review', seconds: 8.5, width: 1280, height: 900, poster: 5.5, keys: [0.5, 2, 3, 5.5] },
  { id: 'player-report-loop', view: 'report', seconds: 10.5, width: 1280, height: 800, poster: 9, keys: [1, 3, 5, 7, 9.5] },
  { id: 'ai-coach-concept-loop', view: 'coach', seconds: 9, width: 1280, height: 800, poster: 5.5, keys: [1, 2.5, 4, 6, 8] },
  { id: 'opening-lesson-concept-loop', view: 'opening', seconds: 10.5, width: 1280, height: 800, poster: 7.5, keys: [0.5, 3.5, 5.5, 7.5, 9.5] },
];
const args = process.argv.slice(2), framesOnly = args.includes('--frames');
const pick = args.filter(a => !a.startsWith('--'));
const run = (...a) => execFileSync(FFMPEG, ['-v', 'error', '-y', ...a], { stdio: 'inherit' });
mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const clip of CLIPS.filter(c => !pick.length || pick.includes(c.view) || pick.includes(c.id))) {
  const url = `${BASE}/demo-record?clip=${clip.view}`;
  if (framesOnly) {
    const page = await browser.newPage({ viewport: { width: clip.width, height: clip.height } });
    await page.goto(url, { waitUntil: 'networkidle' }); const t0 = Date.now();
    for (const at of clip.keys) { await page.waitForTimeout(Math.max(0, at * 1000 - (Date.now() - t0))); await page.screenshot({ path: `${TMP}/${clip.view}-${at}s.png` }); }
    await page.close(); console.log('frames', clip.view); continue;
  }
  // Record one full extra cycle; trim to exactly one loop starting at a timeline reset.
  const dir = `${TMP}/${clip.view}`; rmSync(dir, { recursive: true, force: true });
  const context = await browser.newContext({ viewport: { width: clip.width, height: clip.height }, recordVideo: { dir, size: { width: clip.width, height: clip.height } } });
  const page = await context.newPage(); const opened = Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  // Wait for the second loop to begin, then for it to complete; trim exactly that loop.
  await page.waitForFunction(() => (window.__demoCycles || []).length >= 2, null, { timeout: (clip.seconds + 10) * 1000 });
  const cycleStart = await page.evaluate(() => window.__demoCycles[1]);
  await page.waitForTimeout(clip.seconds * 1000 + 600);
  await context.close();
  const raw = `${dir}/${readdirSync(dir).find(f => f.endsWith('.webm'))}`;
  const start = ((cycleStart - opened) / 1000).toFixed(2), len = clip.seconds.toFixed(2);
  const vf = 'fps=24';
  run('-ss', start, '-t', len, '-i', raw, '-an', '-vf', vf, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-deadline', 'good', `${OUT}/${clip.id}.webm`);
  run('-ss', start, '-t', len, '-i', raw, '-an', '-vf', `${vf},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-movflags', '+faststart', `${OUT}/${clip.id}.mp4`);
  run('-ss', (Number(start) + clip.poster).toFixed(2), '-i', raw, '-frames:v', '1', '-q:v', '3', `${OUT}/${clip.id}.jpg`);
  results.push({ id: clip.id, view: clip.view, duration: clip.seconds, width: clip.width, height: clip.height, fps: 24, bytes: { webm: statSync(`${OUT}/${clip.id}.webm`).size, mp4: statSync(`${OUT}/${clip.id}.mp4`).size, poster: statSync(`${OUT}/${clip.id}.jpg`).size } });
  console.log(results.at(-1));
}
await browser.close();
if (!framesOnly && results.length) {
  const path = 'src/demo-manifest.json', manifest = JSON.parse(readFileSync(path, 'utf8'));
  for (const r of results) Object.assign(manifest.clips.find(c => c.id === r.id), r, { encoded: true, recordedAt: new Date().toISOString() });
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
}
