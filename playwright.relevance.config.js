import { defineConfig } from '@playwright/test';
import { qaConfig } from './tests/qa/config.js';

// Relevance/visual tests use real stored Stockfish evidence and the same strict
// network/source/engine guards, on separately owned ports (no preview reuse).
const production = process.env.LINEA_EXPLANATIONS_PRODUCTION === '1';
const base = qaConfig(production ? 'explanation-relevance-production' : 'explanation-relevance', { production });
const port = production ? 4399 : 4398, baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  ...base,
  testMatch: ['**/explanation-relevance.spec.js', '**/move-explanations.spec.js', '**/branch-review.spec.js'],
  use: { ...base.use, baseURL },
  webServer: { ...base.webServer, command: `npx vite${production ? ' preview' : ''} --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL },
});
