import { createTestDatabase } from '@dz/db/testing';
import type { TestDatabase } from '@dz/db/testing';
import { COMMUNES, WILAYAS } from '@dz/geo';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.ts';
import type { App } from '../../app.ts';
import { testDependencies } from '../../test/helpers.ts';
import { signedInAs } from '../../test/sessions.ts';
import { syncGeoReference } from './sync.ts';

let testDb: TestDatabase;
let app: App;

beforeAll(async () => {
  testDb = await createTestDatabase();
  app = await buildApp(testDependencies({ db: testDb.db }));
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await testDb.drop();
});

describe('référentiel géographique en base', () => {
  it('synchronisation complète puis idempotente', async () => {
    const first = await syncGeoReference(testDb.db);
    expect(first).toEqual({
      wilayas: { created: WILAYAS.length, updated: 0 },
      communes: { created: COMMUNES.length, updated: 0, deactivated: 0 },
    });
    expect(await syncGeoReference(testDb.db)).toEqual({
      wilayas: { created: 0, updated: 0 },
      communes: { created: 0, updated: 0, deactivated: 0 },
    });
    expect(await testDb.db.commune.count()).toBe(1541);
  });

  it('jamais destructive : une commune retirée du référentiel est désactivée, pas supprimée', async () => {
    await testDb.db.commune.create({
      data: {
        id: 1_999_999_999,
        wilayaId: 16,
        nameAr: 'تجريبية',
        nameFr: 'Ancienne',
        nameAscii: 'Ancienne',
      },
    });
    const sync = await syncGeoReference(testDb.db);
    expect(sync.communes.deactivated).toBe(1);
    const kept = await testDb.db.commune.findUniqueOrThrow({ where: { id: 1_999_999_999 } });
    expect(kept.isActive).toBe(false);
  });

  it('lecture : wilayas et communes actives, mises en cache, réservée aux comptes connectés', async () => {
    const agent = await signedInAs(testDb.db, ['CONFIRMATION_AGENT']);
    const wilayas = await app.inject({
      method: 'GET',
      url: '/v1/geo/wilayas',
      headers: agent.headers,
    });
    expect(wilayas.statusCode).toBe(200);
    expect(wilayas.headers['cache-control']).toBe('private, max-age=3600');
    expect(wilayas.json<{ items: unknown[] }>().items).toHaveLength(69);

    const communes = await app.inject({
      method: 'GET',
      url: '/v1/geo/wilayas/16/communes',
      headers: agent.headers,
    });
    const items = communes.json<{ items: { id: number; nameFr: string }[] }>().items;
    expect(items.length).toBe(COMMUNES.filter((c) => c.wilayaCode === 16).length);
    expect(items.some((c) => c.id === 1_999_999_999)).toBe(false);

    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/geo/wilayas/70/communes',
          headers: agent.headers,
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/geo/wilayas' })).statusCode).toBe(401);
  });
});
