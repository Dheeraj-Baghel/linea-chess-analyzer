import { defineConfig } from '@playwright/test';
import { qaConfig } from './tests/qa/config.js';

// Product rollout checks have their own evidence stream, not old release records.
export default defineConfig({ ...qaConfig('product-foundation'), testDir: './tests/product' });
