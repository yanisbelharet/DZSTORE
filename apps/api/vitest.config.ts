import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Builds the migrated template database used by createTestDatabase().
    globalSetup: ['@dz/db/testing/global-setup'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
