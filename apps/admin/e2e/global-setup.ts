import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { recreateDatabase } from '@dz/db/testing';

import { E2E_DATABASE } from '../playwright.config.ts';
import { OWNER } from './fixtures.ts';

/** Fresh migrated database + the first OWNER, created with the production CLI. */
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
}
