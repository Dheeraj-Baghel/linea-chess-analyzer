import { defineConfig } from '@playwright/test';
import { qaConfig } from './tests/qa/config.js';

// Dedicated owned servers; preserve other preview/test ports and all existing
// suites. Native Stockfish and the standard source/network guards stay enabled.
const production = process.env.LINEA_EXPLANATIONS_PRODUCTION === '1';
const base = qaConfig(production ? 'move-explanations-production' : 'move-explanations', { production });
const port = production ? 4395 : 4394, baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  ...base,
  testMatch: ['**/move-explanations.spec.js', '**/branch-review.spec.js'],
  use: { ...base.use, baseURL },
  webServer: { ...base.webServer, command: `npx vite${production ? ' preview' : ''} --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL },
});
