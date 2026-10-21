import { defineConfig } from '@playwright/test';
import { qaConfig } from './tests/qa/config.js';

// Default browser regressions use explicit provider fixtures, never live APIs.
// Native WASM/search-specific checks have their own test:engine suite; UI checks
// here still use the real local engine where their workflow needs it.
const base = qaConfig('browser');
export default defineConfig({
  ...base,
  testIgnore: ['**/production.spec.js', '**/crossbrowser.spec.js', '**/live-*.spec.js', '**/engine-review.spec.js', '**/smoke.spec.js', '**/accuracy-v2.spec.js'],
  reporter: [...base.reporter, ['html', { outputFolder: 'artifacts/testing/browser-report', open: 'never' }]],
});
