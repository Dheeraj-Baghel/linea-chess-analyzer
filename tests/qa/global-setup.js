import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertLineaDocument } from './guards.js';
import { ENGINE_BUILD } from '../../src/engineBuild.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function sourceIdentity() {
  const files = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  for (const directory of ['src', 'server', 'public', 'tests', 'scripts', 'vendor']) await walk(directory);
  for (const file of await fs.readdir('.')) {
    if (file.endsWith('.config.js') || ['package.json', 'package-lock.json', 'index.html'].includes(file)) files.push(file);
  }
  const members = {};
  for (const file of files.sort()) members[file] = hash(await fs.readFile(file));
  return { sha256: hash(JSON.stringify(members)), files: members };
}

export default async function setup(config) {
  const { suite, production, liveProvider } = config.metadata;
  const origin = config.projects[0].use.baseURL;
  const evidenceFile = `artifacts/testing/${suite}-environment.json`;
  const lockPath = 'artifacts/testing/.linea-qa.lock';
  await fs.mkdir('artifacts/testing', { recursive: true });
  // A shared lock prevents even different browser configs/ports from overlapping.
  // Never silently delete a lock left by an interrupted run: inspect its PID first.
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another Linea QA suite owns ${lockPath}. Run suites sequentially; inspect the recorded PID if a run was interrupted.`);
    throw error;
  }
  await lock.writeFile(JSON.stringify({ pid: process.pid, suite, startedAt: new Date().toISOString() }));
  const evidence = {
    suite, origin, production, liveProvider, engineBuild: ENGINE_BUILD, startedAt: new Date().toISOString(),
    node: process.version, platform: process.platform, osRelease: os.release(), arch: process.arch,
    retries: config.projects[0].retries, workers: config.workers, checks: [], executionGaps: [],
    optionalFonts: 'Google Fonts CSS replaced with an empty stylesheet in browser fixtures; documented system fallback is tested.',
  };
  let heartbeat;
  async function release() { clearInterval(heartbeat); await lock.close(); await fs.unlink(lockPath); }
  async function get(url) {
    const response = await fetch(new URL(url, origin), { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, `QA preflight HTTP status for ${url}`);
    return Buffer.from(await response.arrayBuffer());
  }
  try {
    const html = (await get('/')).toString();
    assertLineaDocument(html, { production });
    evidence.checks.push('Linea HTML identity and build mode');
    evidence.source = await sourceIdentity();
    const assetRoot = production ? 'dist' : 'public';
    for (const asset of ['favicon.svg', ENGINE_BUILD.workerUrl.slice(1), ENGINE_BUILD.wasmUrl.slice(1)]) {
      const served = hash(await get(`/${asset}`));
      const local = hash(await fs.readFile(path.join(assetRoot, asset)));
      assert.equal(served, local, `Served asset differs from this checkout: ${asset}`);
      if (asset.endsWith('.wasm')) assert.equal(local, ENGINE_BUILD.wasmSha256, 'WASM does not match the pinned official release');
      if (asset === ENGINE_BUILD.workerUrl.slice(1)) assert.equal(local, ENGINE_BUILD.workerSha256, 'Worker does not match the pinned official release');
      evidence.checks.push({ asset, sha256: served });
    }
    if (production) {
      assert.equal(html, await fs.readFile('dist/index.html', 'utf8'), 'Served build HTML differs from dist');
      for (const [, asset] of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) {
        const served = hash(await get(asset));
        assert.equal(served, hash(await fs.readFile(path.join('dist', asset))), `Mismatched compiled asset: ${asset}`);
        evidence.checks.push({ asset, sha256: served });
      }
    }
    let previous = Date.now();
    heartbeat = setInterval(() => {
      const now = Date.now(), gap = now - previous;
      if (gap > 15000) evidence.executionGaps.push({ at: new Date(now).toISOString(), gapMs: gap });
      previous = now;
    }, 1000);
    heartbeat.unref();
    await fs.writeFile(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
  } catch (error) {
    evidence.preflightError = error.message;
    await fs.writeFile(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
    await release();
    throw error;
  }
  return async () => {
    try {
      evidence.finishedAt = new Date().toISOString();
      evidence.finalSourceSha256 = (await sourceIdentity()).sha256;
      evidence.sourceUnchanged = evidence.source.sha256 === evidence.finalSourceSha256;
      await fs.writeFile(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
      assert.ok(evidence.sourceUnchanged, 'Source changed during QA; this run is not a stable baseline.');
      assert.equal(evidence.executionGaps.length, 0, 'Host execution paused for over 15 seconds; inspect sleep/suspension evidence before rerunning.');
    } finally { await release(); }
  };
}
