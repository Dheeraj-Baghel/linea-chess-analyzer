import { defineConfig } from '@playwright/test';
import { qaConfig } from './tests/qa/config.js';

// A live API outage is external evidence, never a fixture-backed pass. Running
// this config directly also requires opt-in; normal QA never queries an account.
if (process.env.LINEA_LIVE_PROVIDER !== '1') {
  throw new Error('Live Chess.com checks are opt-in. Run npm run test:live explicitly.');
}

export default defineConfig({
  ...qaConfig('live-browser', { liveProvider: true }),
  testMatch: ['live-chesscom.spec.js'],
});
