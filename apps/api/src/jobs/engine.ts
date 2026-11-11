import type { Clock } from '@dz/core';
import { newId } from '@dz/core/ids';
import type { Logger } from '@dz/core/logger';
import { scrubString } from '@dz/core/logger';
import type { DbClient, DbExecutor, Job } from '@dz/db';

import { backoffDelayMs } from './backoff.ts';
import { NonRetryableJobError, RetryLaterError } from './errors.ts';
import { enqueueJob } from './queue.ts';
import type { EnqueueOptions } from './queue.ts';
import type { JobRegistry } from './registry.ts';

/** Outbox event type → jobs to create (fan-out happens exactly once per event, ADR-0023). */
export type Subscriptions = Readonly<
  Record<
    string,
    readonly {
      job: string;
      payload?: (event: OutboxRow) => unknown;
      options?: (event: OutboxRow) => EnqueueOptions;
    }[]
  >
>;

export interface ScheduleDefinition {
  /** Job name, also the schedule id. */
  name: string;
  intervalSeconds: number;
}

export interface OutboxRow {
  id: bigint;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  attempts: number;
}

export interface TickStats {
  recovered: number;
  relayed: number;
  scheduled: number;
  succeeded: number;
  retried: number;
  dead: number;
}

export interface JobEngineOptions {
  db: DbClient;
  clock: Clock;
  logger: Logger;
  registry: JobRegistry;
  subscriptions?: Subscriptions;
  schedules?: readonly ScheduleDefinition[];
  workerId?: string;
  leaseMs?: number;
  random?: () => number;
}

const OUTBOX_MAX_ATTEMPTS = 10;

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return scrubString(message).slice(0, 1000);
}

function isConcurrencyConflict(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${JSON.stringify(error)}` : String(error);
  return text.includes('Job_one_running_per_concurrency_key') || text.includes('23505');
}

export function createJobEngine({
  db,
  clock,
  logger,
  registry,
  subscriptions = {},
  schedules = [],
  workerId = `worker-${newId()}`,
  leaseMs = 5 * 60_000,
  random = Math.random,
}: JobEngineOptions) {
  const log = logger.child({ workerId });

  function enqueue(
    executor: DbExecutor,
    name: string,
    payload: unknown,
    options: Partial<EnqueueOptions> = {},
  ) {
    return enqueueJob(executor, registry, name, payload, { runAt: clock.now(), ...options });
  }

  /** Jobs whose worker vanished (lease expired) become claimable again. */
  async function recoverExpiredLeases(now: Date): Promise<number> {
    return db.$executeRaw`
      UPDATE "Job" SET
        "status" = CASE WHEN "attempts" >= "maxAttempts" THEN 'DEAD'::"JobStatus" ELSE 'PENDING'::"JobStatus" END,
        "finishedAt" = CASE WHEN "attempts" >= "maxAttempts" THEN ${now}::timestamptz ELSE NULL END,
        "lockedBy" = NULL, "lockedUntil" = NULL, "lastError" = 'lease expired', "updatedAt" = ${now}::timestamptz
      WHERE "status" = 'RUNNING' AND "lockedUntil" < ${now}::timestamptz`;
  }

  /** Relays one pending outbox event per transaction; a failing event never blocks the others. */
  async function relayOne(now: Date): Promise<boolean> {
    let failed: OutboxRow | undefined;
    try {
      return await db.$transaction(async (tx) => {
        const [event] = await tx.$queryRaw<OutboxRow[]>`
          SELECT "id", "type", "aggregateType", "aggregateId", "payload", "attempts"
          FROM "OutboxEvent"
          WHERE "status" = 'PENDING' AND "availableAt" <= ${now}::timestamptz
          ORDER BY "id" LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (!event) return false;
        failed = event;
        for (const [index, subscriber] of (subscriptions[event.type] ?? []).entries()) {
          await enqueueJob(
            tx,
            registry,
            subscriber.job,
            subscriber.payload ? subscriber.payload(event) : event.payload,
            {
              runAt: now,
              ...subscriber.options?.(event),
              // One job per subscriber, even when two subscribers share a queue.
              dedupeKey: `outbox:${event.id.toString()}:${String(index)}`,
            },
          );
        }
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: { status: 'DISPATCHED', dispatchedAt: now },
        });
        return true;
      });
    } catch (error) {
      if (!failed) throw error;
      // Atomic and conditional: never overwrite an event another relay dispatched meanwhile.
      const attempts = failed.attempts + 1;
      const retryAt = new Date(now.getTime() + backoffDelayMs(attempts, random));
      await db.$executeRaw`
        UPDATE "OutboxEvent" SET
          "attempts" = "attempts" + 1,
          "lastError" = ${errorMessage(error)},
          "status" = CASE WHEN "attempts" + 1 >= ${OUTBOX_MAX_ATTEMPTS} THEN 'FAILED'::"OutboxStatus" ELSE "status" END,
          "availableAt" = CASE WHEN "attempts" + 1 >= ${OUTBOX_MAX_ATTEMPTS} THEN "availableAt" ELSE ${retryAt}::timestamptz END
        WHERE "id" = ${failed.id} AND "status" = 'PENDING'`;
      log.error(
        { err: error, outboxEventId: failed.id.toString(), attempts },
        'outbox relay failed',
      );
      return true;
    }
  }

  /** Declares the schedules (idempotent); tasks no longer declared are disabled. */
  async function ensureSchedules(): Promise<void> {
    const now = clock.now();
    for (const schedule of schedules) {
      registry.get(schedule.name);
      await db.scheduledTask.upsert({
        where: { name: schedule.name },
        create: { name: schedule.name, intervalSeconds: schedule.intervalSeconds, nextRunAt: now },
        update: { intervalSeconds: schedule.intervalSeconds, enabled: true },
      });
    }
    await db.scheduledTask.updateMany({
      where: { name: { notIn: schedules.map((schedule) => schedule.name) }, enabled: true },
      data: { enabled: false },
    });
  }
  // Serverless has no worker start-up: the first tick of each instance declares the schedules.
  let schedulesReady: Promise<void> | undefined;

  /** Enqueues due scheduled tasks; a conditional update guarantees a single firing. */
  async function fireDueSchedules(now: Date): Promise<number> {
    const due = await db.scheduledTask.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
    });
    let fired = 0;
    for (const task of due) {
      // An unknown task (renamed, removed, older code) must never block the other jobs.
      if (!registry.has(task.name)) {
        log.warn({ task: task.name }, 'scheduled task without registered job skipped');
        continue;
      }
      const claimed = await db.$transaction(async (tx) => {
        const { count } = await tx.scheduledTask.updateMany({
          where: { name: task.name, nextRunAt: task.nextRunAt },
          data: {
            nextRunAt: new Date(now.getTime() + task.intervalSeconds * 1000),
            lastRunAt: now,
          },
        });
        if (count === 0) return false;
        await enqueueJob(
          tx,
          registry,
          task.name,
          {},
          {
            runAt: now,
            dedupeKey: `schedule:${task.name}:${task.nextRunAt.toISOString()}`,
          },
        );
        return true;
      });
      if (claimed) fired += 1;
    }
    return fired;
  }

  async function claimNext(now: Date): Promise<Job | null> {
    try {
      const [job] = await db.$queryRaw<Job[]>`
        UPDATE "Job" SET "status" = 'RUNNING', "attempts" = "attempts" + 1, "lockedBy" = ${workerId},
          "lockedUntil" = ${new Date(now.getTime() + leaseMs)}::timestamptz, "updatedAt" = ${now}::timestamptz
        WHERE "id" = (
          SELECT j."id" FROM "Job" j
          WHERE j."status" = 'PENDING' AND j."runAt" <= ${now}::timestamptz
            AND (j."concurrencyKey" IS NULL OR NOT EXISTS (
              SELECT 1 FROM "Job" r WHERE r."concurrencyKey" = j."concurrencyKey" AND r."status" = 'RUNNING'))
          ORDER BY j."priority" DESC, j."runAt", j."id"
          LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING *`;
      return job ?? null;
    } catch (error) {
      // Two workers raced for the same concurrency key: the unique index refused the second one.
      if (isConcurrencyConflict(error)) return null;
      throw error;
    }
  }

  /** Applies the outcome only if this worker still holds the lease; false = lease lost. */
  async function settle(
    job: Job,
    data: Parameters<DbClient['job']['updateMany']>[0]['data'],
  ): Promise<boolean> {
    const { count } = await db.job.updateMany({
      where: { id: job.id, status: 'RUNNING', lockedBy: workerId },
      data,
    });
    return count === 1;
  }

  /** Extends the lease while the handler runs; aborts the handler if the lease is lost. */
  function holdLease(job: Job, controller: AbortController, jobLog: typeof log) {
    const timer = setInterval(
      () => {
        void db.job
          .updateMany({
            where: { id: job.id, status: 'RUNNING', lockedBy: workerId },
            data: { lockedUntil: new Date(clock.now().getTime() + leaseMs) },
          })
          .then(({ count }) => {
            if (count === 0 && !controller.signal.aborted) {
              jobLog.warn('job lease lost, handler aborted');
              controller.abort(new Error('lease lost'));
            }
          })
          .catch((error: unknown) => {
            jobLog.warn({ err: error }, 'job lease renewal failed');
          });
      },
      Math.max(1_000, Math.floor(leaseMs / 3)),
    );
    return () => {
      clearInterval(timer);
    };
  }

  async function runJob(job: Job): Promise<'succeeded' | 'retried' | 'dead'> {
    const started = performance.now();
    const jobLog = log.child({ jobId: job.id.toString(), queue: job.queue, attempt: job.attempts });
    // Permanent faults (unknown queue, payload refused by its schema): dead-letter at once.
    let permanent: unknown;
    if (!registry.has(job.queue)) permanent = new Error(`Unknown job "${job.queue}"`);
    else {
      try {
        registry.get(job.queue).validate(job.payload);
      } catch (error) {
        permanent = error;
      }
    }
    if (permanent !== undefined) {
      await settle(job, {
        status: 'DEAD',
        finishedAt: clock.now(),
        lastError: errorMessage(permanent),
        lockedBy: null,
        lockedUntil: null,
      });
      jobLog.error({ err: permanent }, 'job moved to dead-letter (permanent error)');
      return 'dead';
    }
    const controller = new AbortController();
    const release = holdLease(job, controller, jobLog);
    try {
      const definition = registry.get(job.queue);
      await definition.run(job.payload, {
        jobId: job.id,
        attempt: job.attempts,
        db,
        clock,
        logger: jobLog,
        signal: controller.signal,
      });
      release();
      const settled = await settle(job, {
        status: 'SUCCEEDED',
        finishedAt: clock.now(),
        lockedBy: null,
        lockedUntil: null,
      });
      if (!settled) {
        jobLog.warn('job finished after losing its lease: outcome not recorded');
        return 'retried';
      }
      jobLog.info({ durationMs: Math.round(performance.now() - started) }, 'job succeeded');
      return 'succeeded';
    } catch (error) {
      release();
      const now = clock.now();
      const lastError = errorMessage(error);
      if (error instanceof RetryLaterError) {
        await settle(job, {
          status: 'PENDING',
          attempts: job.attempts - 1,
          runAt: new Date(now.getTime() + error.retryAfterMs),
          lastError,
          lockedBy: null,
          lockedUntil: null,
        });
        jobLog.warn({ retryAfterMs: error.retryAfterMs }, 'job postponed');
        return 'retried';
      }
      if (error instanceof NonRetryableJobError || job.attempts >= job.maxAttempts) {
        await settle(job, {
          status: 'DEAD',
          finishedAt: now,
          lastError,
          lockedBy: null,
          lockedUntil: null,
        });
        jobLog.error({ err: error }, 'job moved to dead-letter');
        return 'dead';
      }
      await settle(job, {
        status: 'PENDING',
        runAt: new Date(now.getTime() + backoffDelayMs(job.attempts, random)),
        lastError,
        lockedBy: null,
        lockedUntil: null,
      });
      jobLog.warn({ err: error }, 'job failed, will retry');
      return 'retried';
    }
  }

  /**
   * One processing round (ADR-0020): recover leases, relay the outbox, fire schedules, run due
   * jobs — until the time budget or the job limit is reached. Safe to call concurrently.
   */
  async function runTick({ budgetMs = 10_000, maxJobs = 100 } = {}): Promise<TickStats> {
    const deadline = performance.now() + budgetMs;
    const stats: TickStats = {
      recovered: 0,
      relayed: 0,
      scheduled: 0,
      succeeded: 0,
      retried: 0,
      dead: 0,
    };
    schedulesReady ??= ensureSchedules().catch((error: unknown) => {
      schedulesReady = undefined;
      throw error;
    });
    await schedulesReady;
    stats.recovered = await recoverExpiredLeases(clock.now());
    while (performance.now() < deadline && (await relayOne(clock.now()))) stats.relayed += 1;
    stats.scheduled = await fireDueSchedules(clock.now());
    for (let processed = 0; processed < maxJobs && performance.now() < deadline; processed += 1) {
      const job = await claimNext(clock.now());
      if (!job) break;
      stats[await runJob(job)] += 1;
    }
    return stats;
  }

  return { enqueue, ensureSchedules, runTick, workerId };
}

export type JobEngine = ReturnType<typeof createJobEngine>;
