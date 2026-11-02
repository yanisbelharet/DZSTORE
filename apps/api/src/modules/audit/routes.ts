import type { DbClient } from '@dz/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

/** /v1/audit — read-only audit trail (OWNER/ADMIN). */
export const auditRoutes: FastifyPluginAsyncZod<{ db: DbClient }> = (app, { db }) => {
  app.get(
    '/',
    {
      config: { access: { permission: 'audit.read' } },
      schema: {
        tags: ['audit'],
        querystring: z.object({
          entityType: z.string().max(50).optional(),
          entityId: z.string().max(100).optional(),
          actorUserId: z.uuid().optional(),
          action: z.string().max(100).optional(),
          before: z.coerce.bigint().positive().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                at: z.string(),
                actorType: z.string(),
                actorUserId: z.string().nullable(),
                action: z.string(),
                entityType: z.string(),
                entityId: z.string().nullable(),
                storeId: z.string().nullable(),
                before: z.unknown(),
                after: z.unknown(),
                meta: z.unknown(),
              }),
            ),
            nextCursor: z.string().nullable(),
          }),
        },
      },
    },
    async (request) => {
      const { entityType, entityId, actorUserId, action, before, limit } = request.query;
      const rows = await db.auditLog.findMany({
        where: {
          ...(entityType === undefined ? {} : { entityType }),
          ...(entityId === undefined ? {} : { entityId }),
          ...(actorUserId === undefined ? {} : { actorUserId }),
          ...(action === undefined ? {} : { action: { startsWith: action } }),
          ...(before === undefined ? {} : { id: { lt: before } }),
        },
        orderBy: { id: 'desc' },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return {
        items: page.map((row) => ({
          id: row.id.toString(),
          at: row.at.toISOString(),
          actorType: row.actorType,
          actorUserId: row.actorUserId,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          storeId: row.storeId,
          before: row.before,
          after: row.after,
          meta: row.meta,
        })),
        nextCursor: rows.length > limit ? (page.at(-1)?.id.toString() ?? null) : null,
      };
    },
  );
  return Promise.resolve();
};
