import type { EnvSource } from '@dz/core/env';
import { createLogger } from '@dz/core/logger';
import { createDbClient } from '@dz/db';

import { buildApp } from './app.ts';
import { loadApiConfig } from './config.ts';

/** Wires configuration, logger, database and HTTP app from the environment. */
export async function createRuntime(source: EnvSource = process.env) {
  const config = loadApiConfig(source);
  const logger = createLogger({ name: 'api', level: config.logLevel });
  const db = createDbClient({ url: config.databaseUrl });
  const app = await buildApp({
    config,
    logger,
    checkDatabase: async () => {
      await db.$queryRaw`SELECT 1`;
    },
  });
  return {
    config,
    logger,
    db,
    app,
    async close() {
      await app.close();
      await db.$disconnect();
    },
  };
}
