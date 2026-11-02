import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DbClient } from './client.ts';
import { nextCounterValue } from './counter.ts';
import { createTestDatabase } from './testing/index.ts';
import type { TestDatabase } from './testing/index.ts';
import { withTransaction } from './transaction.ts';

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
async function newStoreId(): Promise<string> {
  const slug = `counter-${String(++sequence)}`;
  const store = await db.store.create({
    data: { slug, name: slug, orderPrefix: slug.toUpperCase() },
  });
  return store.id;
}

describe('compteur atomique par boutique', () => {
  it('commence à 1 et s’incrémente de 1', async () => {
    const storeId = await newStoreId();
    expect(await nextCounterValue(db, storeId, 'order')).toBe(1);
    expect(await nextCounterValue(db, storeId, 'order')).toBe(2);
    expect(await nextCounterValue(db, storeId, 'order')).toBe(3);
  });

  it('les compteurs sont indépendants par boutique et par nom', async () => {
    const a = await newStoreId();
    const b = await newStoreId();
    await nextCounterValue(db, a, 'order');
    await nextCounterValue(db, a, 'order');
    expect(await nextCounterValue(db, b, 'order')).toBe(1);
    expect(await nextCounterValue(db, a, 'invoice')).toBe(1);
    expect(await nextCounterValue(db, a, 'order')).toBe(3);
  });

  it('100 incréments concurrents donnent exactement 1 à 100', async () => {
    const storeId = await newStoreId();
    const values = await Promise.all(
      Array.from({ length: 100 }, () =>
        withTransaction(db, (tx) => nextCounterValue(tx, storeId, 'order')),
      ),
    );
    expect([...values].sort((x, y) => x - y)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('une transaction annulée ne consomme pas de numéro', async () => {
    const storeId = await newStoreId();
    expect(await nextCounterValue(db, storeId, 'order')).toBe(1);
    await expect(
      withTransaction(db, async (tx) => {
        expect(await nextCounterValue(tx, storeId, 'order')).toBe(2);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await nextCounterValue(db, storeId, 'order')).toBe(2);
  });

  it('refuse une boutique inexistante', async () => {
    await expect(
      nextCounterValue(db, '01900000-0000-7000-8000-000000000000', 'order'),
    ).rejects.toThrow();
  });
});
