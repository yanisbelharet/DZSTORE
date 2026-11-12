import { randomBytes } from 'node:crypto';

import { createSecretBox, parseEncryptionKeys } from '@dz/core/crypto';
import { createLogger } from '@dz/core/logger';
import { createDbClient } from '@dz/db';

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
    encryptionKeys: parseEncryptionKeys(`1:${randomBytes(32).toString('base64')}`),
    cookieSecure: true,
    tickSecret: undefined,
    storeServiceToken: undefined,
    media: { driver: 'disabled' },
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

/** Prisma connects lazily: unit tests that never query the database need no server. */
const unusedDb = () => createDbClient({ url: 'postgresql://dz:dz@127.0.0.1:1/unused_test' });

export function testDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  const config = overrides.config ?? testConfig();
  return {
    config,
    logger: memoryLogger().logger,
    db: unusedDb(),
    secretBox: createSecretBox(config.encryptionKeys),
    checkDatabase: () => Promise.resolve(),
    ...overrides,
  };
}

/** Anti-CSRF header sent by first-party clients on mutating requests. */
export const CSRF = { 'x-dz-csrf': '1' } as const;
