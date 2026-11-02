import type { DbClient, DbTransaction } from './client.ts';
import { Prisma } from './generated/prisma/client.ts';

export const IsolationLevel = Prisma.TransactionIsolationLevel;
export type IsolationLevel = Prisma.TransactionIsolationLevel;

export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  /** Max time waiting for a pooled connection (default 5 s). */
  maxWaitMs?: number;
  /** Max duration of the transaction (default 10 s). */
  timeoutMs?: number;
}

/** Runs `work` in an interactive transaction: everything commits or nothing does. */
export function withTransaction<T>(
  db: DbClient,
  work: (tx: DbTransaction) => Promise<T>,
  { isolationLevel, maxWaitMs = 5_000, timeoutMs = 10_000 }: TransactionOptions = {},
): Promise<T> {
  return db.$transaction(work, {
    maxWait: maxWaitMs,
    timeout: timeoutMs,
    ...(isolationLevel === undefined ? {} : { isolationLevel }),
  });
}
