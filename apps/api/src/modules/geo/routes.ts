import { AppError } from '@dz/core/errors';
import type { DbClient } from '@dz/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const wilayaDto = z.object({ code: z.number(), nameAr: z.string(), nameFr: z.string() });
const communeDto = z.object({
  id: z.number(),
  nameAr: z.string(),
  nameFr: z.string(),
  postalCode: z.string().nullable(),
});
/** Reference data changes with a law, not every minute: cached by the browser for an hour. */
const CACHE = 'private, max-age=3600';

/** /v1/geo — geographic reference for the admin (active wilayas and communes only). */
export const geoRoutes: FastifyPluginAsyncZod<{ db: DbClient }> = (app, { db }) => {
  app.get(
    '/wilayas',
    {
      config: { access: 'authenticated' },
      schema: { tags: ['geo'], response: { 200: z.object({ items: z.array(wilayaDto) }) } },
    },
    async (_request, reply) => {
      const wilayas = await db.wilaya.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
        select: { id: true, nameAr: true, nameFr: true },
      });
      void reply.header('cache-control', CACHE);
      return { items: wilayas.map(({ id, ...names }) => ({ code: id, ...names })) };
    },
  );

  app.get(
    '/wilayas/:code/communes',
    {
      config: { access: 'authenticated' },
      schema: {
        tags: ['geo'],
        params: z.object({ code: z.coerce.number().int().min(1).max(99) }),
        response: { 200: z.object({ items: z.array(communeDto) }) },
      },
    },
    async (request, reply) => {
      const wilaya = await db.wilaya.findFirst({
        where: { id: request.params.code, isActive: true },
        select: { id: true },
      });
      if (!wilaya) throw new AppError('NOT_FOUND', 'Wilaya not found');
      const items = await db.commune.findMany({
        where: { wilayaId: wilaya.id, isActive: true },
        orderBy: { nameAscii: 'asc' },
        select: { id: true, nameAr: true, nameFr: true, postalCode: true },
      });
      void reply.header('cache-control', CACHE);
      return { items };
    },
  );
  return Promise.resolve();
};
