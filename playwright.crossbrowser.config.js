import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { qaConfig } from './tests/qa/config.js';

// Preserve the existing isolated Firefox app-data setup. Phase 0 reruns must
// report actual launch/workflow outcomes, not infer an environment failure.
const appData = path.join(os.tmpdir(), 'linea-firefox-appdata');
const localData = path.join(os.tmpdir(), 'linea-firefox-localdata');
fs.mkdirSync(appData, { recursive: true });
fs.mkdirSync(localData, { recursive: true });

export default defineConfig({
  ...qaConfig('crossbrowser'),
  testMatch: ['crossbrowser.spec.js'],
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 1000 }, launchOptions: { env: { ...process.env, MOZ_APP_DATA: appData, MOZ_LOCAL_APP_DATA: localData } } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } } },
  ],
});
