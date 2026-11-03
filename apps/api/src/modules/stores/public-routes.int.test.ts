import { apiErrorSchema, resolveStoreResponseSchema, SERVICE_TOKEN_HEADER } from '@dz/contracts';
import { createTestDatabase } from '@dz/db/testing';
import type { TestDatabase } from '@dz/db/testing';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.ts';
import type { App } from '../../app.ts';
import { memoryLogger, testConfig, testDependencies } from '../../test/helpers.ts';
import { signedInAs } from '../../test/sessions.ts';

const TOKEN = 'store-service-token-for-tests-0123456789';
const SERVICE = { [SERVICE_TOKEN_HEADER]: TOKEN };

let testDb: TestDatabase;
let app: App;
const logs = memoryLogger();

beforeAll(async () => {
  testDb = await createTestDatabase();
  app = await buildApp(
    testDependencies({
      db: testDb.db,
      logger: logs.logger,
      config: testConfig({ storeServiceToken: TOKEN }),
    }),
  );
  await app.ready();
  const db = testDb.db;
  await db.store.create({
    data: {
      slug: 'alpha',
      name: 'Boutique Alpha',
      orderPrefix: 'AL',
      theme: { colors: { primary: '#AA0000' }, radius: 'lg' },
      domains: {
        create: [
          { hostname: 'alpha.localhost', isPrimary: false },
          { hostname: 'www.alpha.dz', isPrimary: true },
        ],
      },
    },
  });
  await db.store.create({
    data: {
      slug: 'beta',
      name: 'Boutique Beta',
      orderPrefix: 'BE',
      defaultLocale: 'fr',
      locales: ['fr', 'en'],
      theme: { colors: { primary: 'not-a-colour' } },
      domains: { create: [{ hostname: 'beta.localhost' }] },
    },
  });
  await db.store.create({
    data: {
      slug: 'gamma',
      name: 'Boutique fermée',
      orderPrefix: 'GA',
      isActive: false,
      domains: { create: [{ hostname: 'gamma.localhost', isPrimary: true }] },
    },
  });
});
afterAll(async () => {
  await app.close();
  await testDb.drop();
});

const resolve = (host: string, headers: Record<string, string> = SERVICE) =>
  app.inject({ method: 'GET', url: '/v1/public/stores/resolve', query: { host }, headers });
const errorCode = (res: LightMyRequestResponse) => apiErrorSchema.parse(res.json()).error.code;

describe('GET /v1/public/stores/resolve', () => {
  it('résout la boutique d’un hôte, quel que soit le port ou la casse', async () => {
    const res = await resolve('Alpha.LOCALHOST:4321');
    expect(res.statusCode).toBe(200);
    const { store } = resolveStoreResponseSchema.parse(res.json());
    expect(store).toMatchObject({
      slug: 'alpha',
      name: 'Boutique Alpha',
      defaultLocale: 'ar',
      locales: ['ar', 'fr'],
      primaryHost: 'www.alpha.dz',
    });
    expect(store.theme.colors.primary).toBe('#aa0000');
    expect(store.theme.radius).toBe('lg');
    expect(store.theme.colors.background).toBe('#ffffff');
  });

  it('deux hôtes ⇒ deux boutiques distinctes', async () => {
    const alpha = resolveStoreResponseSchema.parse((await resolve('www.alpha.dz')).json()).store;
    const beta = resolveStoreResponseSchema.parse((await resolve('beta.localhost')).json()).store;
    expect(alpha.slug).toBe('alpha');
    expect(beta.slug).toBe('beta');
  });

  it('ne sert que les langues du store (ar/fr) ; thème invalide ⇒ valeurs par défaut + avertissement', async () => {
    const { store } = resolveStoreResponseSchema.parse((await resolve('beta.localhost')).json());
    expect(store.locales).toEqual(['fr']);
    expect(store.defaultLocale).toBe('fr');
    expect(store.primaryHost).toBeNull();
    expect(store.theme.colors.primary).toBe('#0f766e');
    expect(logs.lines.some((line) => line.msg === 'invalid store theme, defaults used')).toBe(true);
  });

  it.each(['inconnu.localhost', 'gamma.localhost', 'exa mple.dz', '..'])(
    '« %s » (inconnu, inactif ou invalide) ⇒ 404 indistinct',
    async (host) => {
      const res = await resolve(host);
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe('NOT_FOUND');
    },
  );

  it('sans jeton de service, ou avec un mauvais jeton ⇒ 401', async () => {
    expect((await resolve('alpha.localhost', {})).statusCode).toBe(401);
    expect(
      (await resolve('alpha.localhost', { [SERVICE_TOKEN_HEADER]: `${TOKEN}x` })).statusCode,
    ).toBe(401);
  });

  it('une session utilisateur (même OWNER) ne remplace pas le jeton de service', async () => {
    const owner = await signedInAs(testDb.db, ['OWNER']);
    expect((await resolve('alpha.localhost', owner.headers)).statusCode).toBe(401);
  });

  it('jeton non configuré côté API ⇒ toutes les requêtes de service sont refusées', async () => {
    const closed = await buildApp(testDependencies({ db: testDb.db }));
    try {
      const res = await closed.inject({
        method: 'GET',
        url: '/v1/public/stores/resolve',
        query: { host: 'alpha.localhost' },
        headers: SERVICE,
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await closed.close();
    }
  });

  it('le jeton n’apparaît jamais dans les journaux', () => {
    expect(JSON.stringify(logs.lines)).not.toContain(TOKEN);
  });
});
