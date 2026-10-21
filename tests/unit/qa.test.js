import { describe, expect, it } from 'vitest';
import { assertLineaDocument, requestPolicy } from '../qa/guards.js';
import { ENGINE_BUILD } from '../../src/engineBuild.js';

const origin = 'http://127.0.0.1:4336';
const document = '<title>Linea - Chess analysis studio</title><div id="root"></div>';

describe('Phase 0 served-origin guard', () => {
  it('accepts Linea but refuses another app on a reused port', () => {
    expect(() => assertLineaDocument(document)).not.toThrow();
    expect(() => assertLineaDocument('<title>Another app</title><div id="root"></div>')).toThrow(/not the Linea/);
  });
  it('requires compiled assets for the production gate', () => {
    expect(() => assertLineaDocument(`${document}<script src="/@vite/client"></script>`, { production: true })).toThrow(/compiled/);
    expect(() => assertLineaDocument(`${document}<script src="/assets/index-abc.js"></script>`, { production: true })).not.toThrow();
  });
});

describe('Phase 0 network boundaries', () => {
  it('leaves the real local worker and WASM untouched', () => {
    expect(requestPolicy(`${origin}${ENGINE_BUILD.workerUrl}`, origin)).toBe('allow');
    expect(requestPolicy(`${origin}${ENGINE_BUILD.wasmUrl}`, origin)).toBe('allow');
  });
  it('isolates optional font CSS without turning all network failures into passes', () => {
    expect(requestPolicy('https://fonts.googleapis.com/css2?family=DM+Sans', origin)).toBe('font-fallback');
    expect(requestPolicy('https://unexpected.example/resource', origin)).toBe('deny');
  });
  it('blocks both direct provider calls and server-side resolver calls by default', () => {
    expect(requestPolicy('https://api.chess.com/pub/player/example/games/archives', origin)).toBe('deny');
    expect(requestPolicy(`${origin}/api/chesscom/resolve?url=example`, origin)).toBe('deny');
  });
  it('allows only the explicit official provider when live checks are opted in', () => {
    const options = { liveProvider: true };
    expect(requestPolicy('https://api.chess.com/pub/player/example/games/archives', origin, options)).toBe('allow');
    expect(requestPolicy(`${origin}/api/chesscom/resolve?url=example`, origin, options)).toBe('allow');
    expect(requestPolicy('https://api.chess.com.evil.example/pub/player/example', origin, options)).toBe('deny');
    expect(requestPolicy('https://api.chess.com/private/example', origin, options)).toBe('deny');
  });
});
