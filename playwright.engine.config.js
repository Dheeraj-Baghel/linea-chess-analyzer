import { defineConfig } from '@playwright/test';
import { qaConfig } from './tests/qa/config.js';

// Real vendored single-thread Stockfish JS/WASM: native scores, recovery,
// MultiPV, full reviews and independently checked sacrifice evidence.
export default defineConfig({
  ...qaConfig('engine-browser'),
  testMatch: ['engine-review.spec.js', 'smoke.spec.js', 'accuracy-v2.spec.js'],
});
