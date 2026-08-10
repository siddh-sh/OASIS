import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Threads, not the default forks pool: forked workers fail to start when
    // the repo path contains a space (as a Windows user profile often does),
    // dying with "Timeout waiting for worker to respond" before any test runs.
    pool: 'threads',
    // Components only. The API layer is covered by the backend's own live
    // tests against a real database; mocking fetch here would test the mock.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
