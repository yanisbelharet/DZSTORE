// Vitest global setup: builds a migrated template database once per test run.
// Each test file then clones it (CREATE DATABASE … TEMPLATE …), which takes milliseconds.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import { onServer, quoteIdentifier } from './admin.ts';
import { packageRoot, TEMPLATE_DATABASE_ENV, testDatabaseUrl, withDatabase } from './test-env.ts';

export default async function setup(): Promise<() => Promise<void>> {
  const server = testDatabaseUrl();
  const serverUrl = server.toString();
  // Unique per run: several packages may run their integration tests in parallel.
  const template = `dz_test_tpl_${randomBytes(5).toString('hex')}`;

  await onServer(serverUrl, [`CREATE DATABASE ${quoteIdentifier(template)}`]);
  try {
    execFileSync(path.join(packageRoot, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
      cwd: packageRoot,
      env: { ...process.env, DATABASE_URL: withDatabase(server, template) },
      stdio: 'pipe',
    });
  } catch (error) {
    await onServer(serverUrl, [`DROP DATABASE IF EXISTS ${quoteIdentifier(template)}`]);
    throw error;
  }
  process.env[TEMPLATE_DATABASE_ENV] = template;

  return async () => {
    await onServer(serverUrl, [
      `DROP DATABASE IF EXISTS ${quoteIdentifier(template)} WITH (FORCE)`,
    ]);
  };
}
