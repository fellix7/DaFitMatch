import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // The suite runs next to the web tests in CI; a loaded machine must not trip a timeout.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
