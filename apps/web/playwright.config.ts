import { defineConfig, devices } from '@playwright/test';
import { API_URL, SUPABASE_URL } from './e2e/fixtures';

const PORT = Number(process.env.E2E_PORT ?? 5174);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * End-to-end config: the Vite dev server is started for the run and the API is mocked in the
 * browser (see e2e/fixtures.ts), so no Supabase project or paid API is needed.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-publishable-key',
      VITE_API_URL: API_URL,
      VITE_DEV_PASSWORD_LOGIN: 'false',
    },
  },
});
