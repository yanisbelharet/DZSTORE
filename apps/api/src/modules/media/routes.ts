import {
  MEDIA_INPUT_TYPES,
  MEDIA_MAX_BYTES,
  mediaAltSchema,
  mediaListSchema,
  mediaSchema,
} from '@dz/contracts';
import { AppError } from '@dz/core/errors';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { recordAudit } from '../audit/audit.ts';
import { assertStoreAccess, requireAuth } from '../auth/context.ts';
import { deleteMedia, findStoreMedia, toMediaDto, uploadMedia } from './service.ts';
import type { MediaDependencies } from './service.ts';
import type { MediaStorage } from './storage.ts';

const storeParams = z.object({ storeId: z.uuid() });
const mediaParams = storeParams.extend({ mediaId: z.uuid() });
const read = { access: { permission: 'catalog.read' } } as const;
const write = { access: { permission: 'catalog.write' } } as const;

/** /v1/stores/:storeId/media — media library of a store (catalog permissions, store scope). */
export const mediaRoutes: FastifyPluginAsyncZod<{ deps: MediaDependencies }> = (app, { deps }) => {
  const { db, storage } = deps;

  // Uploads are the raw image bytes (no multipart): one file per request, size capped here.
  app.addContentTypeParser(
    [...MEDIA_INPUT_TYPES],
    { parseAs: 'buffer', bodyLimit: MEDIA_MAX_BYTES },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.get(
    '/',
    {
      config: read,
      schema: {
        tags: ['media'],
        params: storeParams,
        querystring: z.object({
          cursor: z.uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(48),
        }),
        response: { 200: mediaListSchema },
      },
    },
    async (request) => {
      const { storeId } = request.params;
      assertStoreAccess(requireAuth(request), storeId);
      const { cursor, limit } = request.query;
      const rows = await db.media.findMany({
        where: { storeId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      });
      const page = rows.slice(0, limit);
      return {
        items: page.map((media) => toMediaDto(media, storage)),
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  );

  app.post(
    '/',
    {
      config: write,
      bodyLimit: MEDIA_MAX_BYTES,
      schema: {
        tags: ['media'],
        params: storeParams,
        consumes: [...MEDIA_INPUT_TYPES],
        response: { 201: mediaSchema },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { storeId } = request.params;
      assertStoreAccess(auth, storeId);
      if (!Buffer.isBuffer(request.body) || request.body.byteLength === 0) {
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Expected the image bytes as the body', {
          details: { field: 'file' },
        });
      }
      const media = await uploadMedia(deps, auth, storeId, request.body);
      return reply.status(201).send(toMediaDto(media, storage));
    },
  );

  app.patch(
    '/:mediaId',
    {
      config: write,
      schema: {
        tags: ['media'],
        params: mediaParams,
        body: z.object({ alt: mediaAltSchema }).strict(),
        response: { 200: mediaSchema },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      const { storeId, mediaId } = request.params;
      assertStoreAccess(auth, storeId);
      await findStoreMedia(db, storeId, mediaId);
      const media = await db.$transaction(async (tx) => {
        const updated = await tx.media.update({
          where: { id: mediaId },
          data: { alt: request.body.alt },
        });
        await recordAudit(tx, {
          actorType: 'USER',
          actorUserId: auth.userId,
          action: 'media.updated',
          entityType: 'Media',
          entityId: mediaId,
          storeId,
        });
        return updated;
      });
      return toMediaDto(media, storage);
    },
  );

  app.delete(
    '/:mediaId',
    { config: write, schema: { tags: ['media'], params: mediaParams } },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { storeId, mediaId } = request.params;
      assertStoreAccess(auth, storeId);
      await deleteMedia(deps, auth, storeId, mediaId);
      return reply.status(204).send();
    },
  );
  return Promise.resolve();
};

const CONTENT_TYPES: Record<string, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  png: 'image/png',
};

/**
 * GET /media/* — files of the local driver (development; on the VPS the reverse proxy may serve
 * the directory itself). Immutable: a key never changes content.
 */
export const localMediaFilesRoutes: FastifyPluginAsyncZod<{ storage: MediaStorage }> = (
  app,
  { storage },
) => {
  app.get(
    '/*',
    {
      schema: { hide: true, params: z.object({ '*': z.string().max(300) }) },
    },
    async (request, reply) => {
      const key = request.params['*'];
      const type = CONTENT_TYPES[key.split('.').pop() ?? ''];
      if (!key.startsWith('media/') || type === undefined) {
        throw new AppError('NOT_FOUND', 'Resource not found');
      }
      let body: Buffer;
      try {
        body = await storage.get(key);
      } catch {
        // Invalid or missing key: indistinguishable from the outside.
        throw new AppError('NOT_FOUND', 'Resource not found');
      }
      return reply
        .header('content-type', type)
        .header('cache-control', 'public, max-age=31536000, immutable')
        .header('cross-origin-resource-policy', 'cross-origin')
        .send(body);
    },
  );
  return Promise.resolve();
};
