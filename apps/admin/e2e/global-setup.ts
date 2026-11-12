import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { createDbClient } from '@dz/db';
import { recreateDatabase } from '@dz/db/testing';

import { E2E_DATABASE } from '../playwright.config.ts';
import { OWNER, STORE } from './fixtures.ts';

/** Fresh migrated database, the first OWNER (production CLI) and one store. */
export default async function globalSetup(): Promise<void> {
  const url = await recreateDatabase(E2E_DATABASE);
  execFileSync(
    'node',
    [
      path.resolve(import.meta.dirname, '../../api/src/cli/create-owner.ts'),
      '--email',
      OWNER.email,
      '--name',
      OWNER.name,
    ],
    { env: { ...process.env, DATABASE_URL: url, OWNER_PASSWORD: OWNER.password }, stdio: 'pipe' },
  );
  const db = createDbClient({ url, maxConnections: 1 });
  try {
    await db.store.create({
      data: {
        slug: 'e2e',
        name: STORE.name,
        orderPrefix: 'EE',
        domains: { create: { hostname: STORE.hostname, isPrimary: true } },
      },
    });
  } finally {
    await db.$disconnect();
  }
}
