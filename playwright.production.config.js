import { defineConfig } from '@playwright/test';
import { qaConfig } from './tests/qa/config.js';

// Verify the fresh compiled bundle and exact vendored worker on an owned port.
export default defineConfig({
  ...qaConfig('production-browser', { production: true }),
  testMatch: ['production.spec.js'],
});
