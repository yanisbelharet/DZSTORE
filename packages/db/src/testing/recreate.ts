import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { onServer, quoteIdentifier } from './admin.ts';
import { packageRoot, testDatabaseUrl, withDatabase } from './test-env.ts';

/**
 * Drops and recreates a named test database, then applies every migration (end-to-end tests).
 * Same guard rails as integration tests: never in production, test server only.
 */
export async function recreateDatabase(name: string): Promise<string> {
  if (!name.includes('test') && !name.includes('e2e')) {
    throw new Error(
      'Refusing to recreate a database whose name contains neither "test" nor "e2e".',
    );
  }
  const server = testDatabaseUrl();
  await onServer(server.toString(), [
    `DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`,
    `CREATE DATABASE ${quoteIdentifier(name)}`,
  ]);
  const url = withDatabase(server, name);
  execFileSync(path.join(packageRoot, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  return url;
}
