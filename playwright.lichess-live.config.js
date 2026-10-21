import { defineConfig } from '@playwright/test';
import { qaConfig } from './tests/qa/config.js';

if (process.env.LINEA_LIVE_PROVIDER !== '1') throw new Error('Live Lichess checks are opt-in. Run npm run test:lichess-live explicitly.');
export default defineConfig({ ...qaConfig('lichess-live', { liveProvider: true }), testMatch: ['live-lichess.spec.js'] });
