import { defineConfig } from '@playwright/test'

/**
 * Browser smoke tests against the running dev servers (frontend :5173,
 * backend :8000 with a real database) — start both first, see README.
 * Only auth is stubbed (see e2e/i18n.spec.ts); data comes from the API.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 1440, height: 1000 },
  },
})
