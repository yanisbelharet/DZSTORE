import { randomBytes } from 'node:crypto';

import { createDbClient } from '../client.ts';
import type { DbClient } from '../client.ts';
import { onServer, quoteIdentifier } from './admin.ts';
import { TEMPLATE_DATABASE_ENV, testDatabaseUrl, withDatabase } from './test-env.ts';

export interface TestDatabase {
  /** Connection string of this isolated, fully migrated database. */
  url: string;
  db: DbClient;
  /** Disconnects and drops the database. */
  drop(): Promise<void>;
}

/** Creates an isolated database cloned from the migrated template (one per test file). */
export async function createTestDatabase(): Promise<TestDatabase> {
  const template = process.env[TEMPLATE_DATABASE_ENV];
  if (!template) {
    throw new Error(`${TEMPLATE_DATABASE_ENV} is missing: is the db global setup configured?`);
  }
  const server = testDatabaseUrl();
  const name = `dz_test_run_${randomBytes(6).toString('hex')}`;
  await onServer(server.toString(), [
    `CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE ${quoteIdentifier(template)}`,
  ]);
  const url = withDatabase(server, name);
  const db = createDbClient({ url, maxConnections: 20 });
  return {
    url,
    db,
    drop: async () => {
      await db.$disconnect();
      await onServer(server.toString(), [
        `DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`,
      ]);
    },
  };
}
