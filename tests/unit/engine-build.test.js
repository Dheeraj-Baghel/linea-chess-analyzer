import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENGINE_BUILD } from '../../src/engineBuild.js';

const hash = value => createHash('sha256').update(value).digest('hex');

describe('Pinned Stockfish.js 19 lite-single release', () => {
  it('selects the requested released single-thread edition and matching adjacent assets', () => {
    expect(ENGINE_BUILD).toMatchObject({ name: 'Stockfish 19 Lite', version: '19.0.1', variant: 'lite-single', threads: 1, uciName: 'Stockfish 19 Lite WASM' });
    expect(ENGINE_BUILD.workerUrl).toBe('/engine/stockfish-19-lite-single.js');
    expect(ENGINE_BUILD.wasmUrl).toBe(ENGINE_BUILD.workerUrl.replace(/\.js$/, '.wasm'));
  });
  it('has the exact official release JS and WASM hashes, not relabeled older assets', () => {
    const script = fs.readFileSync(`public${ENGINE_BUILD.workerUrl}`);
    const wasm = fs.readFileSync(`public${ENGINE_BUILD.wasmUrl}`);
    expect(hash(script)).toBe(ENGINE_BUILD.workerSha256);
    expect(hash(wasm)).toBe(ENGINE_BUILD.wasmSha256);
    expect(script.byteLength).toBe(28230); expect(wasm.byteLength).toBe(1845971);
    expect(script.toString()).toContain('Stockfish.js 19');
    expect([...wasm.subarray(0, 4)]).toEqual([0, 97, 115, 109]);
  });
  it('retains GPL, upstream source and neural-network attribution', () => {
    expect(fs.readFileSync('public/engine/LICENSE.txt', 'utf8')).toContain('GNU GENERAL PUBLIC LICENSE');
    const notice = fs.readFileSync('public/engine/NOTICE.md', 'utf8');
    expect(notice).toContain(ENGINE_BUILD.sourceCommit);
    expect(notice).toContain('nn-61e7af4bb97d');
    expect(notice).toContain(ENGINE_BUILD.release);
  });
  it('does not ship a second older runtime or silently load it as fallback', () => {
    expect(fs.existsSync('public/engine/stockfish-18-lite-single.js')).toBe(false);
    expect(fs.existsSync('public/engine/stockfish-18-lite-single.wasm')).toBe(false);
    expect(fs.readFileSync('src/engine.js', 'utf8')).not.toContain('stockfish-18');
  });
});
