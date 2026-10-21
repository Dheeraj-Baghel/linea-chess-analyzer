import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    restoreMocks: true,
    testTimeout: 12000,
    reporters: ['default', 'json'],
    outputFile: { json: 'artifacts/testing/unit-results.json' },
  },
});
