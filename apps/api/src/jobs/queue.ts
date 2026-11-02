import type { DbExecutor, Prisma } from '@dz/db';

import type { JobRegistry } from './registry.ts';

export interface EnqueueOptions {
  /** Defaults to the engine clock's "now" (never the database clock: one time source). */
  runAt?: Date;
  priority?: number;
  /** Same (job, dedupeKey) is enqueued at most once. */
  dedupeKey?: string;
  /** At most one RUNNING job per key (e.g. `carrier:<accountId>`). */
  concurrencyKey?: string;
  maxAttempts?: number;
}

/**
 * Enqueues a job, inside the caller's transaction when given one: the job exists if and only if
 * the business change is committed. Returns false when a job with the same dedupe key exists.
 */
export async function enqueueJob(
  db: DbExecutor,
  registry: JobRegistry,
  name: string,
  payload: unknown,
  options: EnqueueOptions = {},
): Promise<boolean> {
  const definition = registry.get(name);
  // Validated by the job schema: the result is plain JSON data.
  const data = definition.validate(payload) as Prisma.InputJsonValue;
  const { count } = await db.job.createMany({
    data: [
      {
        queue: name,
        payload: data,
        ...(options.runAt === undefined ? {} : { runAt: options.runAt }),
        ...(options.priority === undefined ? {} : { priority: options.priority }),
        ...(options.dedupeKey === undefined ? {} : { dedupeKey: options.dedupeKey }),
        ...(options.concurrencyKey === undefined ? {} : { concurrencyKey: options.concurrencyKey }),
        maxAttempts: options.maxAttempts ?? definition.maxAttempts ?? 8,
      },
    ],
    skipDuplicates: true,
  });
  return count === 1;
}

export interface DomainEvent {
  type: string;
  aggregateType: string;
  aggregateId: string;
  /** Identifiers only — never personal data. */
  payload: Prisma.InputJsonObject;
}

/**
 * Writes an outbox event in the caller's transaction (ADR-0006). `at` comes from the application
 * clock, like every time the job engine compares against.
 */
export async function publishEvent(db: DbExecutor, event: DomainEvent, at: Date): Promise<void> {
  await db.outboxEvent.create({ data: { ...event, availableAt: at, createdAt: at } });
}
