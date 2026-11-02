import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase } from './testing/index.ts';
import type { TestDatabase } from './testing/index.ts';
import { packageRoot } from './testing/test-env.ts';

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await createTestDatabase();
});
afterAll(async () => {
  await testDb.drop();
});

describe('migrations', () => {
  it('toutes les migrations du dépôt sont appliquées sur une base neuve', async () => {
    const onDisk = readdirSync(path.join(packageRoot, 'prisma/migrations'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const applied = await testDb.db.$queryRaw<{ migration_name: string; finished: boolean }[]>`
      SELECT migration_name, finished_at IS NOT NULL AS finished
      FROM _prisma_migrations ORDER BY migration_name`;
    expect(applied.map((row) => row.migration_name)).toEqual(onDisk);
    expect(applied.every((row) => row.finished)).toBe(true);
  });

  it('le schéma Prisma et les migrations sont synchronisés (aucune dérive)', () => {
    // `--exit-code`: 0 = no difference, 2 = difference (execFileSync throws on non-zero).
    const output = execFileSync(
      path.join(packageRoot, 'node_modules/.bin/prisma'),
      [
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      { cwd: packageRoot, env: { ...process.env, DATABASE_URL: testDb.url }, encoding: 'utf8' },
    );
    expect(output).toContain('No difference detected');
  });
});
