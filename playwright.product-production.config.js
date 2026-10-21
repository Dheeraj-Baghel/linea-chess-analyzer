import { defineConfig } from '@playwright/test';
import { qaConfig } from './tests/qa/config.js';

const base = qaConfig('product-offline', { production: true });
export default defineConfig({ ...base, testDir: './tests/product-production', use: { ...base.use, serviceWorkers: 'allow' } });
