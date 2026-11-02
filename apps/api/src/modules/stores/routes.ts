import type { DbClient } from '@dz/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireAuth, storeFilter } from '../auth/context.ts';

/** /v1/stores — stores visible to the caller (store switcher). Management arrives in P1-02. */
export const storesRoutes: FastifyPluginAsyncZod<{ db: DbClient }> = (app, { db }) => {
  app.get(
    '/',
    {
      config: { access: { permission: 'stores.read' } },
      schema: {
        tags: ['stores'],
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                slug: z.string(),
                name: z.string(),
                isActive: z.boolean(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const scope = storeFilter(requireAuth(request));
      const stores = await db.store.findMany({
        where: scope === undefined ? {} : { id: scope },
        orderBy: { name: 'asc' },
        select: { id: true, slug: true, name: true, isActive: true },
      });
      return { items: stores };
    },
  );
  return Promise.resolve();
};
