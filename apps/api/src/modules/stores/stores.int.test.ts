import { adminStoreSchema, apiErrorSchema } from '@dz/contracts';
import { createTestDatabase } from '@dz/db/testing';
import type { TestDatabase } from '@dz/db/testing';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.ts';
import type { App } from '../../app.ts';
import { testDependencies } from '../../test/helpers.ts';
import { signedInAs } from '../../test/sessions.ts';

let testDb: TestDatabase;
let app: App;
let owner: Awaited<ReturnType<typeof signedInAs>>;
let agentA: Awaited<ReturnType<typeof signedInAs>>;
let storeA: string;
let storeB: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
  app = await buildApp(testDependencies({ db: testDb.db }));
  await app.ready();
  storeA = (
    await testDb.db.store.create({
      data: {
        slug: 'a',
        name: 'Boutique A',
        orderPrefix: 'AA',
        domains: { create: [{ hostname: 'a.test', isPrimary: true }, { hostname: 'b.a.test' }] },
      },
    })
  ).id;
  storeB = (await testDb.db.store.create({ data: { slug: 'b', name: 'B', orderPrefix: 'BB' } })).id;
  owner = await signedInAs(testDb.db, ['OWNER']);
  agentA = await signedInAs(testDb.db, ['CONFIRMATION_AGENT'], { storeIds: [storeA] });
});
afterAll(async () => {
  await app.close();
  await testDb.drop();
});

const errorCode = (res: LightMyRequestResponse) => apiErrorSchema.parse(res.json()).error.code;
const get = (headers: Record<string, string>, id: string) =>
  app.inject({ method: 'GET', url: `/v1/stores/${id}`, headers });
const patch = (headers: Record<string, string>, id: string, payload: object) =>
  app.inject({ method: 'PATCH', url: `/v1/stores/${id}`, headers, payload });

describe('paramètres de boutique', () => {
  it('lecture : paramètres, thème complété et domaines (principal en premier)', async () => {
    const res = await get(owner.headers, storeA);
    expect(res.statusCode).toBe(200);
    const store = adminStoreSchema.parse(res.json());
    expect(store).toMatchObject({ name: 'Boutique A', orderPrefix: 'AA', defaultLocale: 'ar' });
    expect(store.theme.colors.primary).toBe('#0f766e');
    expect(store.domains).toEqual([
      { hostname: 'a.test', isPrimary: true },
      { hostname: 'b.a.test', isPrimary: false },
    ]);
  });

  it('modification par le propriétaire, journalisée', async () => {
    const res = await patch(owner.headers, storeA, {
      name: 'Beauté',
      orderPrefix: 'bt',
      locales: ['fr', 'ar'],
      defaultLocale: 'fr',
      theme: { colors: { primary: '#AA0000' }, radius: 'lg' },
    });
    expect(res.statusCode).toBe(200);
    const store = adminStoreSchema.parse(res.json());
    expect(store).toMatchObject({ name: 'Beauté', orderPrefix: 'BT', defaultLocale: 'fr' });
    expect(store.theme).toMatchObject({ radius: 'lg', colors: { primary: '#aa0000' } });
    const audit = await testDb.db.auditLog.findFirstOrThrow({
      where: { action: 'store.updated', entityId: storeA },
    });
    expect(audit).toMatchObject({ actorUserId: owner.user.id, storeId: storeA });
    expect(audit.before).toMatchObject({ orderPrefix: 'AA' });
    expect(audit.after).toMatchObject({ orderPrefix: 'BT' });
  });

  it('refus : langue par défaut non proposée, préfixe pris, champ non modifiable', async () => {
    const locale = await patch(owner.headers, storeA, { locales: ['ar'] });
    expect([locale.statusCode, errorCode(locale)]).toEqual([422, 'VALIDATION_FAILED']);
    const prefix = await patch(owner.headers, storeA, { orderPrefix: 'BB' });
    expect([prefix.statusCode, errorCode(prefix)]).toEqual([409, 'CONFLICT']);
    for (const payload of [{ slug: 'x' }, { isActive: false }, { domains: [] }, { name: 'x' }]) {
      expect((await patch(owner.headers, storeA, payload)).statusCode).toBe(422);
    }
    const unchanged = adminStoreSchema.parse((await get(owner.headers, storeA)).json());
    expect([unchanged.orderPrefix, unchanged.defaultLocale]).toEqual(['BT', 'fr']);
  });

  it('droits et périmètre : un agent lit sa boutique, ne modifie rien, ne voit pas les autres', async () => {
    expect((await get(agentA.headers, storeA)).statusCode).toBe(200);
    const other = await get(agentA.headers, storeB);
    expect([other.statusCode, errorCode(other)]).toEqual([404, 'NOT_FOUND']);
    expect((await patch(agentA.headers, storeA, { name: 'Pirate' })).statusCode).toBe(403);
    expect((await get(owner.headers, '00000000-0000-7000-8000-000000000000')).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/v1/stores/${storeA}` })).statusCode).toBe(401);
  });
});
