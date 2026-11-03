import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: real API + built storefront (Node adapter) on a dedicated database.
// Hosts *.localhost resolve to the loopback in Chromium: one server, several stores.
const API_PORT = 3102;
export const STORE_PORT = 4322;
/** Second storefront instance whose API is unreachable (503 path). */
export const STORE_NO_API_PORT = 4323;
export const E2E_DATABASE = 'dz_e2e_store';
export const SERVICE_TOKEN = 'e2e-store-service-token-0123456789abcdef';
const testDatabase = process.env.DATABASE_URL_TEST ?? 'postgresql://dz:dz@localhost:5432/dz_test';
const e2eDatabaseUrl = testDatabase.replace(/\/[^/?]+(\?|$)/u, `/${E2E_DATABASE}$1`);

export const storeUrl = (host: string, path = '/', port = STORE_PORT) =>
  `http://${host}:${String(port)}${path}`;

const storeServer = (port: number, apiUrl: string, extraEnv: Record<string, string> = {}) => ({
  // Built by `pnpm test:e2e` (astro build) beforehand: the production server is tested.
  command: 'node ./dist/server/entry.mjs',
  url: `http://127.0.0.1:${String(port)}/health`,
  reuseExistingServer: false,
  env: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'warn',
    HOST: '127.0.0.1',
    PORT: String(port),
    STORE_API_URL: apiUrl,
    STORE_SERVICE_TOKEN: SERVICE_TOKEN,
    ...extraEnv,
  },
});

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /lighthouse/u },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /lighthouse/u,
    },
    { name: 'lighthouse', testMatch: /lighthouse/u },
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
        STORE_SERVICE_TOKEN: SERVICE_TOKEN,
      },
    },
    storeServer(STORE_PORT, `http://127.0.0.1:${String(API_PORT)}`),
    // Nothing listens on port 9 (discard): every API call fails (errors expected, not logged).
    storeServer(STORE_NO_API_PORT, 'http://127.0.0.1:9', {
      LOG_LEVEL: 'silent',
      STORE_API_TIMEOUT_MS: '500',
    }),
  ],
});
