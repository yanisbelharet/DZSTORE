import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createFactories, UNUSABLE_PASSWORD_HASH } from './factories.ts';
import { createTestDatabase } from './test-database.ts';
import type { TestDatabase } from './test-database.ts';

let testDb: TestDatabase;
beforeAll(async () => {
  testDb = await createTestDatabase();
});
afterAll(async () => {
  await testDb.drop();
});

describe('fabriques de test', () => {
  it('boutiques : valeurs uniques et déterministes, domaine principal = premier hôte', async () => {
    const make = createFactories(testDb.db);
    const first = await make.store();
    const second = await make.store({
      hostnames: ['b.localhost', 'www.b.localhost'],
      locales: ['fr'],
    });
    expect([first.slug, first.orderPrefix]).toEqual(['boutique-1', 'T1']);
    expect([second.slug, second.orderPrefix]).toEqual(['boutique-2', 'T2']);
    const domains = await testDb.db.storeDomain.findMany({
      where: { storeId: second.id },
      orderBy: { hostname: 'asc' },
      select: { hostname: true, isPrimary: true },
    });
    expect(domains).toEqual([
      { hostname: 'b.localhost', isPrimary: true },
      { hostname: 'www.b.localhost', isPrimary: false },
    ]);
  });

  it('utilisateurs : rôles, accès boutique, mot de passe inutilisable par défaut', async () => {
    const make = createFactories(testDb.db);
    const store = await make.store({ slug: 'acces', orderPrefix: 'AC' });
    const agent = await make.user({ roles: ['FOLLOWUP_AGENT'], storeIds: [store.id] });
    expect(agent.email).toBe('user2@factory.test');
    expect(agent.passwordHash).toBe(UNUSABLE_PASSWORD_HASH);
    const access = await testDb.db.userStoreAccess.findMany({ where: { userId: agent.id } });
    expect(access.map((row) => row.storeId)).toEqual([store.id]);
  });
});
