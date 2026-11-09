import { randomBytes } from 'node:crypto';

import { createSecretBox, parseEncryptionKeys } from '@dz/core/crypto';
import { fixedClock } from '@dz/core/time';
import { createFactories, createTestDatabase } from '@dz/db/testing';
import type { TestDatabase } from '@dz/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.ts';
import { totpCode, timeStep } from '../modules/auth/totp.ts';
import { CSRF, testConfig, testDependencies } from '../test/helpers.ts';
import { DEMO_PASSWORD, DEMO_STORES, DEMO_USERS } from './demo-data.ts';
import { planSeed, seedDemo } from './seed.ts';

const keys = `1:${randomBytes(32).toString('base64')}`;
const secretBox = createSecretBox(parseEncryptionKeys(keys));
let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await createTestDatabase();
});
afterAll(async () => {
  await testDb.drop();
});

const localPlan = (reset = false) =>
  planSeed({ nodeEnv: 'test', databaseUrl: testDb.url, reset, password: undefined });

/** Every row the seed may touch, in a stable order. */
async function snapshot() {
  const { db } = testDb;
  return {
    stores: await db.store.findMany({ orderBy: { slug: 'asc' } }),
    domains: await db.storeDomain.findMany({ orderBy: { hostname: 'asc' } }),
    users: await db.user.findMany({ orderBy: { email: 'asc' } }),
    access: await db.userStoreAccess.findMany({ orderBy: [{ userId: 'asc' }, { storeId: 'asc' }] }),
    secrets: await db.secret.findMany({ orderBy: { id: 'asc' } }),
  };
}

describe('seed de démonstration', () => {
  it('crée les boutiques, domaines et comptes de démo', async () => {
    const summary = await seedDemo({ db: testDb.db, secretBox }, localPlan());
    expect(summary).toEqual({
      created: DEMO_STORES.length + DEMO_USERS.length,
      updated: 0,
      unchanged: 0,
    });
    const state = await snapshot();
    expect(state.stores.map((s) => s.slug)).toEqual(['demo-beaute', 'demo-maison']);
    expect(state.domains.map((d) => [d.hostname, d.isPrimary])).toEqual([
      ['beaute.localhost', true],
      ['maison.localhost', true],
    ]);
    expect(state.users.map((u) => u.roles.join('+')).sort()).toEqual(
      [
        'ADMIN',
        'CONFIRMATION_AGENT',
        'CONFIRMATION_AGENT',
        'CONFIRMATION_AGENT+FOLLOWUP_AGENT',
        'FOLLOWUP_AGENT',
        'OWNER',
      ].sort(),
    );
    const owner = state.users.find((u) => u.email === 'owner@demo.test');
    expect(owner?.totpEnabledAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(state.users.find((u) => u.email === 'suivi@demo.test')?.totpEnabledAt).toBeNull();
  });

  it('est idempotent : une seconde exécution ne change rien (pas même updatedAt)', async () => {
    const before = await snapshot();
    const summary = await seedDemo({ db: testDb.db, secretBox }, localPlan());
    expect(summary).toEqual({
      created: 0,
      updated: 0,
      unchanged: DEMO_STORES.length + DEMO_USERS.length,
    });
    expect(await snapshot()).toEqual(before);
  });

  it('répare une donnée de démo modifiée, sans toucher aux autres données', async () => {
    const make = createFactories(testDb.db);
    const other = await make.store({ slug: 'perso', orderPrefix: 'PER' });
    await testDb.db.store.update({
      where: { slug: 'demo-beaute' },
      data: { name: 'Renommée', theme: {} },
    });
    await testDb.db.user.update({
      where: { email: 'mixte@demo.test' },
      data: { isActive: false, roles: ['OWNER'] },
    });
    const summary = await seedDemo({ db: testDb.db, secretBox }, localPlan());
    expect(summary.updated).toBe(2);
    expect((await testDb.db.store.findUniqueOrThrow({ where: { slug: 'demo-beaute' } })).name).toBe(
      'Beauté Démo',
    );
    const mixte = await testDb.db.user.findUniqueOrThrow({ where: { email: 'mixte@demo.test' } });
    expect([mixte.isActive, mixte.roles]).toEqual([true, ['CONFIRMATION_AGENT', 'FOLLOWUP_AGENT']]);
    expect(await testDb.db.store.findUnique({ where: { id: other.id } })).not.toBeNull();
  });

  it('--reset (base locale) vide toutes les tables avant de semer', async () => {
    const summary = await seedDemo({ db: testDb.db, secretBox }, localPlan(true));
    expect(summary.created).toBe(DEMO_STORES.length + DEMO_USERS.length);
    expect(await testDb.db.store.count()).toBe(DEMO_STORES.length);
  });

  it('domaines publics (environnement de test) : deviennent principaux, sans clé de chiffrement', async () => {
    const plan = planSeed({
      nodeEnv: 'production',
      deploymentEnvironment: 'test',
      databaseUrl: 'postgresql://user:pw@ep-demo-pooler.neon.tech/neondb',
      reset: false,
      password: 'Mot de passe du test 2026',
      storeHosts: 'demo-beaute=dzstore-beaute.vercel.app',
    });
    await seedDemo({ db: testDb.db }, plan);
    const domains = await testDb.db.storeDomain.findMany({
      where: { store: { slug: 'demo-beaute' } },
      orderBy: { hostname: 'asc' },
      select: { hostname: true, isPrimary: true },
    });
    expect(domains).toEqual([
      { hostname: 'beaute.localhost', isPrimary: false },
      { hostname: 'dzstore-beaute.vercel.app', isPrimary: true },
    ]);
    const before = await snapshot();
    expect(await seedDemo({ db: testDb.db }, plan)).toMatchObject({ created: 0, updated: 0 });
    expect(await snapshot()).toEqual(before);
    // Back to the local plan: the local domain becomes primary again (still one primary).
    await seedDemo({ db: testDb.db, secretBox }, localPlan());
    const primaries = await testDb.db.storeDomain.count({
      where: { store: { slug: 'demo-beaute' }, isPrimary: true },
    });
    expect(primaries).toBe(1);
  });

  it('le compte OWNER de démo se connecte avec le mot de passe et le code TOTP documentés', async () => {
    const clock = fixedClock('2026-11-03T09:00:00Z');
    const app = await buildApp(
      testDependencies({
        db: testDb.db,
        secretBox,
        clock,
        config: testConfig({ encryptionKeys: parseEncryptionKeys(keys) }),
      }),
    );
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        headers: CSRF,
        payload: { email: 'owner@demo.test', password: DEMO_PASSWORD },
      });
      expect(login.statusCode).toBe(200);
      expect(login.json<{ twoFactor: string }>().twoFactor).toBe('verification_required');
      const cookie = login.cookies.find((c) => c.name === '__Host-dz_session');
      const secret = DEMO_USERS.find((u) => u.email === 'owner@demo.test')?.totpSecret ?? '';
      const verify = await app.inject({
        method: 'POST',
        url: '/v1/auth/2fa/verify',
        headers: { ...CSRF, cookie: `__Host-dz_session=${cookie?.value ?? ''}` },
        payload: { code: totpCode(secret, timeStep(clock.now())) },
      });
      expect(verify.statusCode).toBe(204);
    } finally {
      await app.close();
    }
  });
});
