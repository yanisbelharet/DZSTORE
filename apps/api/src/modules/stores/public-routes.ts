import {
  normalizeHostname,
  resolveStoreQuerySchema,
  resolveStoreResponseSchema,
  STORE_LOCALES,
  themeSchema,
} from '@dz/contracts';
import type { PublicStore, StoreLocale } from '@dz/contracts';
import { AppError } from '@dz/core/errors';
import type { DbClient } from '@dz/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const isStoreLocale = (value: string): value is StoreLocale =>
  (STORE_LOCALES as readonly string[]).includes(value);

/**
 * /v1/public/stores — called by the storefront server only (service token, ADR-0021).
 * `GET /resolve?host=` maps a request hostname to its active store.
 */
export const publicStoresRoutes: FastifyPluginAsyncZod<{ db: DbClient }> = (app, { db }) => {
  app.get(
    '/resolve',
    {
      config: { access: 'service' },
      schema: {
        tags: ['public'],
        querystring: resolveStoreQuerySchema,
        response: { 200: resolveStoreResponseSchema },
      },
    },
    async (request) => {
      const hostname = normalizeHostname(request.query.host);
      // Unknown, malformed and inactive are indistinguishable from the outside.
      const notFound = new AppError('NOT_FOUND', 'Resource not found');
      if (hostname === undefined) throw notFound;

      const domain = await db.storeDomain.findUnique({
        where: { hostname },
        select: {
          store: {
            select: {
              id: true,
              slug: true,
              name: true,
              defaultLocale: true,
              locales: true,
              theme: true,
              isActive: true,
              domains: { where: { isPrimary: true }, select: { hostname: true } },
            },
          },
        },
      });
      const store = domain?.store;
      if (!store?.isActive) throw notFound;

      const parsedTheme = themeSchema.safeParse(store.theme);
      if (!parsedTheme.success) {
        // A bad theme must never take the storefront down: defaults are served instead.
        request.log.warn({ storeId: store.id }, 'invalid store theme, defaults used');
      }
      const locales = store.locales.filter(isStoreLocale);
      const servedLocales: StoreLocale[] = locales.length > 0 ? locales : ['ar'];
      const result: PublicStore = {
        id: store.id,
        slug: store.slug,
        name: store.name,
        defaultLocale:
          isStoreLocale(store.defaultLocale) && servedLocales.includes(store.defaultLocale)
            ? store.defaultLocale
            : (servedLocales[0] ?? 'ar'),
        locales: servedLocales,
        primaryHost: store.domains[0]?.hostname ?? null,
        theme: parsedTheme.success ? parsedTheme.data : themeSchema.parse({}),
      };
      return { store: result };
    },
  );
  return Promise.resolve();
};
