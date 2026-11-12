import {
  productInputSchema,
  productListSchema,
  productSchema,
  productStatusSchema,
  productStatusUpdateSchema,
  productUpdateSchema,
} from '@dz/contracts';
import { can } from '@dz/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { assertStoreAccess, requireAuth } from '../auth/context.ts';
import {
  createProduct,
  duplicateProduct,
  getProduct,
  listProducts,
  setProductStatus,
  toProductDto,
  updateProduct,
} from './service.ts';
import type { Actor, ProductsDependencies } from './service.ts';

const storeParams = z.object({ storeId: z.uuid() });
const productParams = storeParams.extend({ productId: z.uuid() });
const read = { access: { permission: 'catalog.read' } } as const;
const write = { access: { permission: 'catalog.write' } } as const;

/** Authenticated caller within the store of the URL (store scope enforced on every route). */
function actorFor(request: FastifyRequest, storeId: string): Actor {
  const auth = requireAuth(request);
  assertStoreAccess(auth, storeId);
  return { userId: auth.userId, canSeeCost: can(auth.roles, 'finance.read') };
}

/** /v1/stores/:storeId/products — catalogue of a store (PRD §5). */
export const productsRoutes: FastifyPluginAsyncZod<{ deps: ProductsDependencies }> = (
  app,
  { deps },
) => {
  app.get(
    '/',
    {
      config: read,
      schema: {
        tags: ['products'],
        params: storeParams,
        querystring: z.object({
          /** Absent: everything but archived products. */
          status: z.enum([...productStatusSchema.options, 'ALL']).optional(),
          q: z.string().trim().min(1).max(100).optional(),
          cursor: z.uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
        response: { 200: productListSchema },
      },
    },
    (request) => {
      actorFor(request, request.params.storeId);
      return listProducts(deps, request.params.storeId, request.query);
    },
  );

  app.get(
    '/:productId',
    {
      config: read,
      schema: { tags: ['products'], params: productParams, response: { 200: productSchema } },
    },
    async (request) => {
      const { storeId, productId } = request.params;
      const actor = actorFor(request, storeId);
      return toProductDto(await getProduct(deps.db, storeId, productId), deps.storage, actor);
    },
  );

  app.post(
    '/',
    {
      config: write,
      schema: {
        tags: ['products'],
        params: storeParams,
        body: productInputSchema,
        response: { 201: productSchema },
      },
    },
    async (request, reply) => {
      const { storeId } = request.params;
      const product = await createProduct(deps, actorFor(request, storeId), storeId, request.body);
      return reply.status(201).send(product);
    },
  );

  app.put(
    '/:productId',
    {
      config: write,
      schema: {
        tags: ['products'],
        params: productParams,
        body: productUpdateSchema,
        response: { 200: productSchema },
      },
    },
    (request) => {
      const { storeId, productId } = request.params;
      return updateProduct(deps, actorFor(request, storeId), storeId, productId, request.body);
    },
  );

  app.patch(
    '/:productId/status',
    {
      config: write,
      schema: {
        tags: ['products'],
        params: productParams,
        body: productStatusUpdateSchema,
        response: { 200: productSchema },
      },
    },
    (request) => {
      const { storeId, productId } = request.params;
      return setProductStatus(
        deps,
        actorFor(request, storeId),
        storeId,
        productId,
        request.body.status,
      );
    },
  );

  app.post(
    '/:productId/duplicate',
    {
      config: write,
      schema: { tags: ['products'], params: productParams, response: { 201: productSchema } },
    },
    async (request, reply) => {
      const { storeId, productId } = request.params;
      const copy = await duplicateProduct(deps, actorFor(request, storeId), storeId, productId);
      return reply.status(201).send(copy);
    },
  );
  return Promise.resolve();
};
