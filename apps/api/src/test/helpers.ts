import { createLogger } from '@dz/core/logger';

import type { AppDependencies } from '../app.ts';
import type { ApiConfig } from '../config.ts';

export function testConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    nodeEnv: 'test',
    logLevel: 'info',
    host: '127.0.0.1',
    port: 0,
    databaseUrl: 'postgresql://dz:dz@localhost:5432/dz_test',
    corsOrigins: [],
    bodyLimitBytes: 1024,
    trustProxy: false,
    docsEnabled: true,
    ...overrides,
  };
}

/** Logger writing JSON lines to memory, to assert on what is (not) logged. */
export function memoryLogger() {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({
    name: 'api-test',
    level: 'info',
    destination: {
      write(chunk: string) {
        lines.push(JSON.parse(chunk) as Record<string, unknown>);
      },
    },
  });
  return { logger, lines };
}

export function testDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    config: testConfig(),
    logger: memoryLogger().logger,
    checkDatabase: () => Promise.resolve(),
    ...overrides,
  };
}
