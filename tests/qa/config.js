import { devices } from '@playwright/test';
import { ENGINE_BUILD } from '../../src/engineBuild.js';

// Phase 0: own the QA servers. Never attach tests to a user's preview (or another
// app sharing its port). Every suite has one worker and no automatic retries.
export const devOrigin = 'http://127.0.0.1:4336';
export const productionOrigin = 'http://127.0.0.1:4337';
export const chromium = {
  name: 'chromium',
  use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
};

export function qaConfig(suite, { production = false, liveProvider = false } = {}) {
  const baseURL = production ? productionOrigin : devOrigin;
  return {
    testDir: './tests/browser',
    timeout: 60000,
    expect: { timeout: 10000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    globalSetup: './tests/qa/global-setup.js',
    metadata: { suite, production, liveProvider, engine: `${ENGINE_BUILD.name} ${ENGINE_BUILD.version}`, engineVariant: ENGINE_BUILD.variant },
    outputDir: `artifacts/testing/${suite}-output`,
    reporter: [
      ['list'],
      ['json', { outputFile: `artifacts/testing/${suite}-results.json` }],
    ],
    use: {
      baseURL,
      trace: 'retain-on-failure',
      screenshot: 'only-on-failure',
      video: 'off',
      actionTimeout: 10000,
      navigationTimeout: 20000,
      serviceWorkers: 'block',
    },
    projects: [chromium],
    webServer: {
      command: production
        ? 'npx vite preview --host 127.0.0.1 --port 4337 --strictPort'
        : 'npx vite --host 127.0.0.1 --port 4336 --strictPort',
      url: baseURL,
      reuseExistingServer: false,
      timeout: 30000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
  };
}
