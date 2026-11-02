import { AppError } from '@dz/core/errors';

import type { DbExecutor } from './client.ts';

/**
 * Atomically increments a per-store counter (e.g. order numbers) and returns the new value.
 * A single `INSERT … ON CONFLICT DO UPDATE` takes a row lock until the surrounding transaction
 * ends: concurrent callers are serialized, values are unique and contiguous, and a rolled-back
 * transaction does not consume a number.
 */
export async function nextCounterValue(
  db: DbExecutor,
  storeId: string,
  name: string,
): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "StoreCounter" ("storeId", "name", "value")
    VALUES (${storeId}::uuid, ${name}, 1)
    ON CONFLICT ("storeId", "name") DO UPDATE SET "value" = "StoreCounter"."value" + 1
    RETURNING "value"`;
  const [row] = rows;
  if (!row) throw new AppError('INTERNAL', 'Counter increment returned no row');
  return row.value;
}
