export * from './generated/prisma/client.ts';
export { createDbClient } from './client.ts';
export type { CreateDbClientOptions, DbClient, DbExecutor, DbTransaction } from './client.ts';
export { IsolationLevel, withTransaction } from './transaction.ts';
export type { TransactionOptions } from './transaction.ts';
export { nextCounterValue } from './counter.ts';

export const dbPackage = {
  name: '@dz/db',
  dependsOn: ['@dz/core'],
} as const;
