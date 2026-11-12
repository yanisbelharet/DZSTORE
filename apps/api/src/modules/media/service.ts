import { mediaAltSchema, mediaVariantSchema } from '@dz/contracts';
import type { MediaAlt, MediaDto, MediaVariant } from '@dz/contracts';
import type { Clock } from '@dz/core';
import { AppError } from '@dz/core/errors';
import type { DbClient, Media, Prisma } from '@dz/db';
import { z } from 'zod';

import type { MediaConfig } from '../../config.ts';
import type { JobEngine } from '../../jobs/engine.ts';
import { recordAudit } from '../audit/audit.ts';
import { sanitizeImage } from './image.ts';
import { createLocalDiskStorage, createR2Storage } from './storage.ts';
import type { MediaStorage } from './storage.ts';

export const MEDIA_PROCESS_JOB = 'media.process';

/** Storage driver from the configuration; `undefined` when media are disabled. */
export function createMediaStorage(config: MediaConfig): MediaStorage | undefined {
  switch (config.driver) {
    case 'disabled':
      return undefined;
    case 'local':
      return createLocalDiskStorage(config);
    case 'r2':
      return createR2Storage(config);
  }
}

/** `media/<storeId>/<mediaId>/<file>`: every file of a media under one prefix. */
export const mediaKey = (storeId: string, mediaId: string, file: string) =>
  `media/${storeId}/${mediaId}/${file}`;

const variantsSchema = z.array(mediaVariantSchema);

/** Stored JSON is validated when read (a corrupted row degrades, never crashes). */
export const storedVariants = (value: Prisma.JsonValue): MediaVariant[] => {
  const parsed = variantsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};
const storedAlt = (value: Prisma.JsonValue): MediaAlt => {
  const parsed = mediaAltSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
};

export function toMediaDto(media: Media, storage: MediaStorage | undefined): MediaDto {
  const url = (key: string) => storage?.publicUrl(key) ?? '';
  return {
    id: media.id,
    storeId: media.storeId,
    status: media.status,
    mimeType: media.mimeType,
    width: media.width,
    height: media.height,
    bytes: media.bytes,
    alt: storedAlt(media.alt),
    url: url(media.storageKey),
    variants: storedVariants(media.variants).map(({ format, width, height, key }) => ({
      format,
      width,
      height,
      url: url(key),
    })),
    createdAt: media.createdAt.toISOString(),
  };
}

export interface MediaDependencies {
  db: DbClient;
  clock: Clock;
  jobs: JobEngine;
  storage: MediaStorage | undefined;
}

export function requireStorage(storage: MediaStorage | undefined): MediaStorage {
  if (!storage) {
    throw new AppError('UNAVAILABLE', 'Media storage is not configured (MEDIA_DRIVER)', {
      details: { reason: 'MEDIA_DISABLED' },
    });
  }
  return storage;
}

/**
 * Upload: the image is validated and cleaned (metadata stripped) before anything is stored;
 * the media row and its processing job are created in one transaction.
 */
export async function uploadMedia(
  { db, jobs, storage: maybeStorage }: MediaDependencies,
  actor: { userId: string },
  storeId: string,
  body: Uint8Array,
): Promise<Media> {
  const storage = requireStorage(maybeStorage);
  const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw new AppError('NOT_FOUND', 'Resource not found');
  const image = await sanitizeImage(body);
  const id = crypto.randomUUID();
  const storageKey = mediaKey(storeId, id, `original.${image.ext}`);
  await storage.put(storageKey, image.data, image.mimeType);
  try {
    return await db.$transaction(async (tx) => {
      const media = await tx.media.create({
        data: {
          id,
          storeId,
          storageKey,
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          bytes: image.data.byteLength,
        },
      });
      await jobs.enqueue(tx, MEDIA_PROCESS_JOB, { mediaId: id }, { dedupeKey: id });
      await recordAudit(tx, {
        actorType: 'USER',
        actorUserId: actor.userId,
        action: 'media.uploaded',
        entityType: 'Media',
        entityId: id,
        storeId,
        meta: { bytes: media.bytes, width: media.width, height: media.height },
      });
      return media;
    });
  } catch (error) {
    // Nothing references the file yet: remove it rather than leave an orphan.
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function findStoreMedia(db: DbClient, storeId: string, mediaId: string) {
  const media = await db.media.findFirst({ where: { id: mediaId, storeId } });
  if (!media) throw new AppError('NOT_FOUND', 'Resource not found');
  return media;
}

/** Deletes the row first (source of truth), then its files (best effort, idempotent). */
export async function deleteMedia(
  { db, storage }: MediaDependencies,
  actor: { userId: string },
  storeId: string,
  mediaId: string,
): Promise<void> {
  const media = await findStoreMedia(db, storeId, mediaId);
  await db.$transaction(async (tx) => {
    await tx.media.delete({ where: { id: media.id } });
    await recordAudit(tx, {
      actorType: 'USER',
      actorUserId: actor.userId,
      action: 'media.deleted',
      entityType: 'Media',
      entityId: media.id,
      storeId,
    });
  });
  if (storage) {
    const keys = [media.storageKey, ...storedVariants(media.variants).map((v) => v.key)];
    await Promise.all(keys.map((key) => storage.delete(key).catch(() => undefined)));
  }
}
