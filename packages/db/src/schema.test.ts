import { randomBytes } from 'node:crypto';

import { createSecretBox, parseEncryptionKeys } from '@dz/core/crypto';
import { isUuidV7 } from '@dz/core/ids';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DbClient } from './client.ts';
import { createTestDatabase } from './testing/index.ts';
import type { TestDatabase } from './testing/index.ts';

let testDb: TestDatabase;
let db: DbClient;

beforeAll(async () => {
  testDb = await createTestDatabase();
  db = testDb.db;
});
afterAll(async () => {
  await testDb.drop();
});

let sequence = 0;
const unique = (prefix: string) => `${prefix}-${String(++sequence)}`;

function createStore(overrides: { slug?: string; orderPrefix?: string } = {}) {
  const slug = overrides.slug ?? unique('store');
  return db.store.create({
    data: { slug, name: `Store ${slug}`, orderPrefix: overrides.orderPrefix ?? slug.toUpperCase() },
  });
}

function createUser(email = `${unique('agent')}@example.test`) {
  return db.user.create({
    data: { email, name: 'Agent', passwordHash: 'argon2id$fake', roles: ['CONFIRMATION_AGENT'] },
  });
}

const sessionData = (userId: string, tokenHash: string) => ({
  userId,
  tokenHash,
  kind: 'WEB' as const,
  expiresAt: new Date('2030-01-01T00:00:00Z'),
  absoluteExpiresAt: new Date('2030-02-01T00:00:00Z'),
});

describe('schéma socle (PostgreSQL réel)', () => {
  it('génère des identifiants UUIDv7 et applique les valeurs par défaut', async () => {
    const store = await createStore();
    expect(isUuidV7(store.id)).toBe(true);
    expect(store.defaultLocale).toBe('ar');
    expect(store.locales).toEqual(['ar', 'fr']);
    expect(store.timezone).toBe('Africa/Algiers');
  });

  it('slug et préfixe de commande uniques', async () => {
    await createStore({ slug: 'beaute', orderPrefix: 'BT' });
    await expect(createStore({ slug: 'beaute', orderPrefix: 'BX' })).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(createStore({ slug: 'beaute-2', orderPrefix: 'BT' })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('nom de domaine unique, en minuscules et sans port', async () => {
    const store = await createStore();
    await db.storeDomain.create({ data: { storeId: store.id, hostname: 'beaute.localhost' } });
    await expect(
      db.storeDomain.create({ data: { storeId: store.id, hostname: 'beaute.localhost' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      db.storeDomain.create({ data: { storeId: store.id, hostname: 'Beaute.Example' } }),
    ).rejects.toThrow(/StoreDomain_hostname_normalized/u);
    await expect(
      db.storeDomain.create({ data: { storeId: store.id, hostname: 'example.test:8080' } }),
    ).rejects.toThrow(/StoreDomain_hostname_normalized/u);
  });

  it('un seul domaine principal par boutique (index partiel)', async () => {
    const store = await createStore();
    const other = await createStore();
    const domain = (storeId: string, isPrimary: boolean) =>
      db.storeDomain.create({ data: { storeId, hostname: `${unique('host')}.test`, isPrimary } });
    await domain(store.id, true);
    await domain(store.id, false);
    await domain(store.id, false);
    await domain(other.id, true);
    await expect(domain(store.id, true)).rejects.toMatchObject({ code: 'P2002' });
  });

  it('e-mail utilisateur unique et en minuscules', async () => {
    await createUser('owner@example.test');
    await expect(createUser('owner@example.test')).rejects.toMatchObject({ code: 'P2002' });
    await expect(createUser('Owner@Example.test')).rejects.toThrow(/User_email_lowercase/u);
  });

  it('empreinte de jeton de session unique', async () => {
    const user = await createUser();
    await db.session.create({ data: sessionData(user.id, 'hash-1') });
    await expect(db.session.create({ data: sessionData(user.id, 'hash-1') })).rejects.toMatchObject(
      { code: 'P2002' },
    );
  });

  it('supprimer une boutique supprime ses domaines, compteurs et accès', async () => {
    const store = await createStore();
    const user = await createUser();
    await db.storeDomain.create({ data: { storeId: store.id, hostname: `${unique('h')}.test` } });
    await db.storeCounter.create({ data: { storeId: store.id, name: 'order', value: 3 } });
    await db.userStoreAccess.create({ data: { storeId: store.id, userId: user.id } });

    await db.store.delete({ where: { id: store.id } });

    expect(await db.storeDomain.count({ where: { storeId: store.id } })).toBe(0);
    expect(await db.storeCounter.count({ where: { storeId: store.id } })).toBe(0);
    expect(await db.userStoreAccess.count({ where: { storeId: store.id } })).toBe(0);
    expect(await db.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it('supprimer un utilisateur supprime ses sessions et conserve son audit (acteur à NULL)', async () => {
    const user = await createUser();
    await db.session.create({ data: sessionData(user.id, unique('hash')) });
    const log = await db.auditLog.create({
      data: { actorType: 'USER', actorUserId: user.id, action: 'user.login', entityType: 'User' },
    });

    await db.user.delete({ where: { id: user.id } });

    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    const kept = await db.auditLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(kept.actorUserId).toBeNull();
    expect(kept.action).toBe('user.login');
  });

  it('un compteur ne peut pas être négatif', async () => {
    const store = await createStore();
    await expect(
      db.storeCounter.create({ data: { storeId: store.id, name: 'order', value: -1 } }),
    ).rejects.toThrow(/StoreCounter_value_non_negative/u);
  });

  it('stocke un secret chiffré (octets) et le relit à l’identique', async () => {
    const box = createSecretBox(parseEncryptionKeys(`1:${randomBytes(32).toString('base64')}`));
    const sealed = box.encrypt('ecotrack-token-123', { context: 'carrier:demo' });
    const secret = await db.secret.create({
      data: {
        kind: 'CARRIER_TOKEN',
        ciphertext: Buffer.from(sealed.ciphertext),
        iv: Buffer.from(sealed.iv),
        authTag: Buffer.from(sealed.authTag),
        keyVersion: sealed.keyVersion,
        last4: '••••-123',
      },
    });
    const read = await db.secret.findUniqueOrThrow({ where: { id: secret.id } });
    expect(box.decrypt(read, { context: 'carrier:demo' })).toBe('ecotrack-token-123');
  });

  it('les événements outbox ont des identifiants croissants', async () => {
    const first = await db.outboxEvent.create({
      data: { type: 'test.event', aggregateType: 'Test', aggregateId: 'a', payload: {} },
    });
    const second = await db.outboxEvent.create({
      data: { type: 'test.event', aggregateType: 'Test', aggregateId: 'b', payload: {} },
    });
    expect(second.id).toBeGreaterThan(first.id);
    expect(first.status).toBe('PENDING');
  });
});
