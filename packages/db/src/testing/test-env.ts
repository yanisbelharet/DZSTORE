import { existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

/**
 * URL of the PostgreSQL server used by integration tests (`DATABASE_URL_TEST`).
 * Guard rails: refuses to run in production or against a database whose name lacks "test",
 * because test helpers create and drop databases.
 */
export function testDatabaseUrl(): URL {
  const envFile = path.join(repoRoot, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Integration test databases are refused when NODE_ENV=production.');
  }
  const raw = process.env.DATABASE_URL_TEST;
  if (!raw) {
    throw new Error(
      'DATABASE_URL_TEST is missing: run `pnpm db:local` and copy .env.example to .env.',
    );
  }
  const url = new URL(raw);
  if (!url.pathname.toLowerCase().includes('test')) {
    throw new Error('DATABASE_URL_TEST must point to a database whose name contains "test".');
  }
  return url;
}

export function withDatabase(url: URL, database: string): string {
  const copy = new URL(url);
  copy.pathname = `/${database}`;
  return copy.toString();
}

export const TEMPLATE_DATABASE_ENV = 'DZ_TEST_TEMPLATE_DATABASE';
export const packageRoot = path.resolve(import.meta.dirname, '../..');
