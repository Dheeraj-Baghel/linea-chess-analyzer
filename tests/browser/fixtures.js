import { test as base, expect } from '@playwright/test';
import { requestPolicy } from '../qa/guards.js';

// Never mock UCI messages or scores here. Only optional font CSS and explicitly
// declared per-test provider responses are substituted. Unexpected remote I/O
// fails the test instead of silently depending on the user's Internet connection.
export const test = base.extend({
  _networkEvidence: [async ({ context, browser, baseURL }, use, testInfo) => {
    const liveProvider = testInfo.config.metadata.liveProvider === true;
    const unexpected = [];
    const evidence = { origin: baseURL, browser: browser.version(), liveProvider, fonts: 'system fallback', workers: [], errors: [], requestFailures: [], httpErrors: [], navigations: [] };
    const observe = page => {
      page.on('worker', worker => evidence.workers.push(worker.url()));
      page.on('pageerror', error => evidence.errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') evidence.errors.push({ message: message.text(), location: message.location() });
      });
      page.on('requestfailed', request => evidence.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
      page.on('response', response => {
        if (response.status() >= 400) evidence.httpErrors.push({ url: response.url(), status: response.status() });
      });
      page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) evidence.navigations.push(frame.url());
      });
    };
    context.on('page', observe);
    for (const page of context.pages()) observe(page);
    await context.route('**/*', async route => {
      const url = route.request().url();
      const policy = requestPolicy(url, baseURL, { liveProvider });
      if (policy === 'font-fallback') {
        await route.fulfill({ contentType: 'text/css', body: '/* Phase 0 QA: use the documented system font fallback. */' });
      } else if (policy === 'allow') await route.fallback();
      else {
        unexpected.push(url);
        await route.abort('blockedbyclient');
      }
    });
    await use();
    await testInfo.attach('runtime-and-network-evidence', { body: Buffer.from(JSON.stringify({ ...evidence, unexpectedRequests: unexpected }, null, 2)), contentType: 'application/json' });
    expect(unexpected, 'Unexpected external request: add an explicit provider fixture or use the opt-in live suite').toEqual([]);
  }, { auto: true }],
});

export { expect, devices } from '@playwright/test';
