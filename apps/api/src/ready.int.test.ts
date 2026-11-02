import { createTestDatabase } from '@dz/db/testing';
import type { TestDatabase } from '@dz/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from './app.ts';
import type { App } from './app.ts';
import { testDependencies } from './test/helpers.ts';

let testDb: TestDatabase;
let app: App;

beforeAll(async () => {
  testDb = await createTestDatabase();
  app = await buildApp(
    testDependencies({
      checkDatabase: async () => {
        await testDb.db.$queryRaw`SELECT 1`;
      },
    }),
  );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await testDb.drop(); // idempotent
});

describe('/ready sur une vraie base PostgreSQL', () => {
  it('200 quand la base répond, 503 quand elle disparaît', async () => {
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);
    // Simulates a database outage: connections are terminated and the database is dropped.
    await testDb.drop();
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(503);
  });
});
