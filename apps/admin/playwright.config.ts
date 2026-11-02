import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: real API + real admin (Vite) on a dedicated, freshly migrated database.
const API_PORT = 3101;
const ADMIN_PORT = 5174;
export const E2E_DATABASE = 'dz_e2e';
const testDatabase = process.env.DATABASE_URL_TEST ?? 'postgresql://dz:dz@localhost:5432/dz_test';
const e2eDatabaseUrl = testDatabase.replace(/\/[^/?]+(\?|$)/u, `/${E2E_DATABASE}$1`);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  // No retry: the scenarios are serial and stateful (a retry would hide a flaky test).
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(ADMIN_PORT)}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'node ../api/src/main-http.ts',
      url: `http://127.0.0.1:${String(API_PORT)}/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        LOG_LEVEL: 'warn',
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
        DATABASE_URL: e2eDatabaseUrl,
        APP_ENCRYPTION_KEYS: `1:${Buffer.alloc(32, 42).toString('base64')}`,
      },
    },
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${String(ADMIN_PORT)}`,
      url: `http://127.0.0.1:${String(ADMIN_PORT)}`,
      reuseExistingServer: false,
      env: {
        ADMIN_API_TARGET: `http://127.0.0.1:${String(API_PORT)}`,
        ADMIN_PORT: String(ADMIN_PORT),
      },
    },
  ],
});
