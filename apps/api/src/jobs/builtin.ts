import { z } from 'zod';

import { purgeExpiredRateLimits } from '../modules/rate-limit/rate-limit.ts';
import type { ScheduleDefinition } from './engine.ts';
import { defineJob } from './registry.ts';

const DAY_MS = 86_400_000;
const empty = z.object({}).strict();

/** Housekeeping jobs (ARCHITECTURE §5, `maintenance.*`). */
export const maintenanceJobs = [
  defineJob({
    name: 'maintenance.purge-rate-limits',
    payload: empty,
    handler: async (_payload, { db, clock, logger }) => {
      const deleted = await purgeExpiredRateLimits(db, clock.now());
      logger.info({ deleted }, 'expired rate-limit windows purged');
    },
  }),
  defineJob({
    name: 'maintenance.purge-sessions',
    payload: empty,
    handler: async (_payload, { db, clock, logger }) => {
      const cutoff = new Date(clock.now().getTime() - 30 * DAY_MS);
      const { count } = await db.session.deleteMany({
        where: { OR: [{ revokedAt: { lt: cutoff } }, { absoluteExpiresAt: { lt: cutoff } }] },
      });
      logger.info({ deleted: count }, 'old sessions purged');
    },
  }),
  defineJob({
    name: 'maintenance.purge-history',
    payload: empty,
    handler: async (_payload, { db, clock, logger }) => {
      const now = clock.now().getTime();
      const jobs = await db.job.deleteMany({
        where: {
          status: { in: ['SUCCEEDED', 'CANCELLED'] },
          finishedAt: { lt: new Date(now - 14 * DAY_MS) },
        },
      });
      const outbox = await db.outboxEvent.deleteMany({
        where: { status: 'DISPATCHED', dispatchedAt: { lt: new Date(now - 30 * DAY_MS) } },
      });
      const keys = await db.idempotencyKey.deleteMany({
        where: { expiresAt: { lt: new Date(now) } },
      });
      logger.info(
        { jobs: jobs.count, outbox: outbox.count, idempotencyKeys: keys.count },
        'history purged',
      );
    },
  }),
];

export const maintenanceSchedules: ScheduleDefinition[] = [
  { name: 'maintenance.purge-rate-limits', intervalSeconds: 3_600 },
  { name: 'maintenance.purge-sessions', intervalSeconds: 86_400 },
  { name: 'maintenance.purge-history', intervalSeconds: 86_400 },
];
