import { defineConfig } from '@playwright/test';
import { qaConfig } from './tests/qa/config.js';

// Dedicated strict ports: the workspace's other apps currently use 4336/4337.
// Keep the normal identity/network/one-worker guards; never reuse their servers.
const production = process.env.LINEA_BRANCH_PRODUCTION === '1';
const base = qaConfig(production ? 'branch-review-production' : 'branch-review', { production });
const port = production ? 4391 : 4390, baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  ...base,
  testIgnore: ['**/production.spec.js', '**/crossbrowser.spec.js', '**/live-*.spec.js', '**/engine-review.spec.js', '**/smoke.spec.js', '**/accuracy-v2.spec.js'],
  use: { ...base.use, baseURL },
  webServer: { ...base.webServer, command: `npx vite${production ? ' preview' : ''} --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL },
});
