import {
  adminStoreSchema,
  isDefaultLocaleOffered,
  STORE_LOCALES,
  themeSchema,
  updateStoreSchema,
} from '@dz/contracts';
import type { AdminStore, StoreLocale } from '@dz/contracts';
import { AppError } from '@dz/core/errors';
import type { DbClient, Prisma } from '@dz/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { recordAudit } from '../audit/audit.ts';
import { assertStoreAccess, requireAuth, storeFilter } from '../auth/context.ts';

const idParams = z.object({ id: z.uuid() });
const storeSelect = {
  id: true,
  slug: true,
  name: true,
  orderPrefix: true,
  defaultLocale: true,
  locales: true,
  theme: true,
  isActive: true,
  updatedAt: true,
  domains: { select: { hostname: true, isPrimary: true }, orderBy: { hostname: 'asc' } },
} as const satisfies Prisma.StoreSelect;
type StoreRow = Prisma.StoreGetPayload<{ select: typeof storeSelect }>;

// The database enum also holds back-office languages (en): a store only serves ar/fr.
const isStoreLocale = (value: string): value is StoreLocale =>
  (STORE_LOCALES as readonly string[]).includes(value);
const storeLocaleOf = (value: string): StoreLocale => (isStoreLocale(value) ? value : 'ar');

function toAdminStore(store: StoreRow): AdminStore {
  // A stored theme that no longer validates is shown with defaults (never a 500).
  const theme = themeSchema.safeParse(store.theme);
  return {
    ...store,
    defaultLocale: storeLocaleOf(store.defaultLocale),
    locales: store.locales.filter(isStoreLocale),
    theme: theme.success ? theme.data : themeSchema.parse({}),
    domains: [...store.domains].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
    updatedAt: store.updatedAt.toISOString(),
  };
}

/** Audit snapshot: settings only (a store holds no personal data). */
const snapshot = (store: StoreRow) => ({
  name: store.name,
  orderPrefix: store.orderPrefix,
  defaultLocale: store.defaultLocale,
  locales: store.locales,
  theme: store.theme as Prisma.InputJsonValue,
});

/**
 * /v1/stores — stores visible to the caller and their settings (P1-02). Creation, activation
 * and custom domains are not exposed yet (phase 10); the store scope applies to every query.
 */
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

  app.get(
    '/:id',
    {
      config: { access: { permission: 'stores.read' } },
      schema: { tags: ['stores'], params: idParams, response: { 200: adminStoreSchema } },
    },
    async (request) => {
      assertStoreAccess(requireAuth(request), request.params.id);
      const store = await db.store.findUnique({
        where: { id: request.params.id },
        select: storeSelect,
      });
      if (!store) throw new AppError('NOT_FOUND', 'Resource not found');
      return toAdminStore(store);
    },
  );

  app.patch(
    '/:id',
    {
      config: { access: { permission: 'stores.manage' } },
      schema: {
        tags: ['stores'],
        params: idParams,
        body: updateStoreSchema,
        response: { 200: adminStoreSchema },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params;
      assertStoreAccess(auth, id);
      const input = request.body;
      return db.$transaction(async (tx) => {
        const current = await tx.store.findUnique({ where: { id }, select: storeSelect });
        if (!current) throw new AppError('NOT_FOUND', 'Resource not found');
        const defaultLocale = input.defaultLocale ?? storeLocaleOf(current.defaultLocale);
        const locales = input.locales ?? current.locales.filter(isStoreLocale);
        if (!isDefaultLocaleOffered(defaultLocale, locales)) {
          throw new AppError('VALIDATION_FAILED', 'The default language must be offered', {
            details: { field: 'defaultLocale' },
          });
        }
        if (input.orderPrefix !== undefined && input.orderPrefix !== current.orderPrefix) {
          const taken = await tx.store.count({
            where: { orderPrefix: input.orderPrefix, id: { not: id } },
          });
          if (taken > 0) {
            throw new AppError('CONFLICT', 'Another store already uses this order prefix', {
              details: { field: 'orderPrefix' },
            });
          }
        }
        const updated = await tx.store.update({
          where: { id },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.orderPrefix === undefined ? {} : { orderPrefix: input.orderPrefix }),
            ...(input.defaultLocale === undefined ? {} : { defaultLocale: input.defaultLocale }),
            ...(input.locales === undefined ? {} : { locales: input.locales }),
            ...(input.theme === undefined ? {} : { theme: input.theme }),
          },
          select: storeSelect,
        });
        await recordAudit(tx, {
          actorType: 'USER',
          actorUserId: auth.userId,
          action: 'store.updated',
          entityType: 'Store',
          entityId: id,
          storeId: id,
          before: snapshot(current),
          after: snapshot(updated),
        });
        return toAdminStore(updated);
      });
    },
  );
  return Promise.resolve();
};
