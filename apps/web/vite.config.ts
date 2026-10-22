import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env at the repo root; Vite only exposes VITE_-prefixed vars to the browser.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // The Playwright specs in e2e/ are not vitest suites.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // jsdom is slow here: the quiz flow renders 24 cards, so give the tests room.
    testTimeout: 20_000,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable',
      VITE_API_URL: 'http://api.test',
    },
  },
});
