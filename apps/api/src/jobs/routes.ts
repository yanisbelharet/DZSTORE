import { AppError } from '@dz/core/errors';
import { safeEqual } from '@dz/core/crypto';
import type { DbClient, Job } from '@dz/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { recordAudit } from '../modules/audit/audit.ts';
import { requireAuth } from '../modules/auth/context.ts';
import type { JobEngine } from './engine.ts';

const jobStatus = z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'DEAD', 'CANCELLED']);
const jobId = z.object({ id: z.coerce.bigint().positive() });
const jobDto = z.object({
  id: z.string(),
  queue: z.string(),
  status: jobStatus,
  attempts: z.number(),
  maxAttempts: z.number(),
  runAt: z.string(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
const toDto = (job: Job) => ({
  id: job.id.toString(),
  queue: job.queue,
  status: job.status,
  attempts: job.attempts,
  maxAttempts: job.maxAttempts,
  runAt: job.runAt.toISOString(),
  lastError: job.lastError,
  createdAt: job.createdAt.toISOString(),
  finishedAt: job.finishedAt?.toISOString() ?? null,
});

const manage = { access: { permission: 'jobs.manage' } } as const;

/** /v1/jobs — dead-letter queue and job monitoring (OWNER/ADMIN). */
export const jobsRoutes: FastifyPluginAsyncZod<{ db: DbClient }> = (app, { db }) => {
  app.get(
    '/',
    {
      config: manage,
      schema: {
        tags: ['jobs'],
        querystring: z.object({
          status: jobStatus.optional(),
          queue: z.string().max(100).optional(),
          before: z.coerce.bigint().positive().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        }),
        response: { 200: z.object({ items: z.array(jobDto), nextCursor: z.string().nullable() }) },
      },
    },
    async (request) => {
      const { status, queue, before, limit } = request.query;
      const jobs = await db.job.findMany({
        where: {
          ...(status === undefined ? {} : { status }),
          ...(queue === undefined ? {} : { queue }),
          ...(before === undefined ? {} : { id: { lt: before } }),
        },
        orderBy: { id: 'desc' },
        take: limit + 1,
      });
      const page = jobs.slice(0, limit);
      return {
        items: page.map(toDto),
        nextCursor: jobs.length > limit ? (page.at(-1)?.id.toString() ?? null) : null,
      };
    },
  );

  app.get(
    '/stats',
    {
      config: manage,
      schema: {
        tags: ['jobs'],
        response: {
          200: z.object({
            items: z.array(z.object({ queue: z.string(), status: jobStatus, count: z.number() })),
          }),
        },
      },
    },
    async () => {
      const groups = await db.job.groupBy({ by: ['queue', 'status'], _count: { _all: true } });
      return {
        items: groups.map((group) => ({
          queue: group.queue,
          status: group.status,
          count: group._count._all,
        })),
      };
    },
  );

  app.post(
    '/:id/retry',
    { config: manage, schema: { tags: ['jobs'], params: jobId, response: { 200: jobDto } } },
    async (request) => {
      const auth = requireAuth(request);
      const { count } = await db.job.updateMany({
        where: { id: request.params.id, status: { in: ['DEAD', 'CANCELLED'] } },
        data: { status: 'PENDING', attempts: 0, runAt: new Date(), finishedAt: null },
      });
      if (count === 0) throw new AppError('CONFLICT', 'Only dead or cancelled jobs can be retried');
      await recordAudit(db, {
        actorType: 'USER',
        actorUserId: auth.userId,
        action: 'job.retried',
        entityType: 'Job',
        entityId: request.params.id.toString(),
      });
      return toDto(await db.job.findUniqueOrThrow({ where: { id: request.params.id } }));
    },
  );

  app.post(
    '/:id/cancel',
    {
      config: manage,
      schema: {
        tags: ['jobs'],
        params: jobId,
        body: z.object({ reason: z.string().trim().min(3).max(500) }),
        response: { 200: jobDto },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      const { count } = await db.job.updateMany({
        where: { id: request.params.id, status: { in: ['PENDING', 'DEAD'] } },
        data: { status: 'CANCELLED', finishedAt: new Date() },
      });
      if (count === 0) throw new AppError('CONFLICT', 'Only pending or dead jobs can be cancelled');
      await recordAudit(db, {
        actorType: 'USER',
        actorUserId: auth.userId,
        action: 'job.cancelled',
        entityType: 'Job',
        entityId: request.params.id.toString(),
        meta: { reason: request.body.reason },
      });
      return toDto(await db.job.findUniqueOrThrow({ where: { id: request.params.id } }));
    },
  );

  return Promise.resolve();
};

/**
 * /v1/internal/tick — runs one job round on demand (serverless test environment, ADR-0020).
 * Guarded by a shared secret; absent (404) when no secret is configured.
 */
export const tickRoutes: FastifyPluginAsyncZod<{
  jobs: JobEngine;
  tickSecret: string | undefined;
}> = (app, { jobs, tickSecret }) => {
  app.post(
    '/tick',
    {
      config: { access: 'public' },
      schema: {
        tags: ['jobs'],
        response: {
          200: z.object({
            recovered: z.number(),
            relayed: z.number(),
            scheduled: z.number(),
            succeeded: z.number(),
            retried: z.number(),
            dead: z.number(),
          }),
        },
      },
    },
    async (request) => {
      if (tickSecret === undefined) throw new AppError('NOT_FOUND', 'Resource not found');
      const provided = request.headers['x-tick-secret'];
      if (typeof provided !== 'string' || !safeEqual(provided, tickSecret)) {
        throw new AppError('UNAUTHENTICATED', 'Invalid tick secret');
      }
      return jobs.runTick({ budgetMs: 8_000 });
    },
  );
  return Promise.resolve();
};
