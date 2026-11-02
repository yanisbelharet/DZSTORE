import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.ts';
import type { Prisma } from './generated/prisma/client.ts';

export type DbClient = PrismaClient;
export type DbTransaction = Prisma.TransactionClient;
/** Anything that can run queries: the client itself or an interactive transaction. */
export type DbExecutor = DbClient | DbTransaction;

export interface CreateDbClientOptions {
  url: string;
  /** Maximum pooled connections (pg pool `max`). */
  maxConnections?: number;
}

/** Prisma 7 client over the `pg` driver adapter (no Rust query engine). */
export function createDbClient({ url, maxConnections = 10 }: CreateDbClientOptions): DbClient {
  const adapter = new PrismaPg({ connectionString: url, max: maxConnections });
  return new PrismaClient({ adapter });
}
