import { z } from 'zod';

import { recordAudit } from '../modules/audit/audit.ts';
import type { Subscriptions } from './engine.ts';
import { defineJob } from './registry.ts';

/**
 * End-to-end check of the job pipeline (test environment acceptance, P0-12): an admin publishes
 * a `system.test` outbox event; a tick relays it to the `system.test-event` job, which records
 * an audit entry. Idempotent: running the job twice for one event writes one entry.
 */
export const SYSTEM_TEST_EVENT = 'system.test';
export const SYSTEM_TEST_PROCESSED = 'system.test_event.processed';

export const systemJobs = [
  defineJob({
    name: 'system.test-event',
    payload: z.object({ outboxEventId: z.string().regex(/^\d+$/u) }).strict(),
    handler: async ({ outboxEventId }, { db, logger }) => {
      const done = await db.auditLog.findFirst({
        where: { action: SYSTEM_TEST_PROCESSED, entityId: outboxEventId },
        select: { id: true },
      });
      if (done !== null) return;
      await recordAudit(db, {
        actorType: 'SYSTEM',
        action: SYSTEM_TEST_PROCESSED,
        entityType: 'OutboxEvent',
        entityId: outboxEventId,
      });
      logger.info({ outboxEventId }, 'test event processed');
    },
  }),
];

export const systemSubscriptions: Subscriptions = {
  [SYSTEM_TEST_EVENT]: [
    { job: 'system.test-event', payload: (event) => ({ outboxEventId: event.id.toString() }) },
  ],
};
