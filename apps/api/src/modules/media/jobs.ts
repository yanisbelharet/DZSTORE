import { z } from 'zod';

import { NonRetryableJobError } from '../../jobs/errors.ts';
import { defineJob } from '../../jobs/registry.ts';
import type { JobDefinition } from '../../jobs/registry.ts';
import { generateVariants } from './image.ts';
import { MEDIA_PROCESS_JOB, mediaKey } from './service.ts';
import type { MediaStorage } from './storage.ts';

const MAX_ATTEMPTS = 5;
const MIME = { avif: 'image/avif', webp: 'image/webp' } as const;

/**
 * `media.process` (ARCHITECTURE §5): AVIF + WebP variants of a stored original. Idempotent:
 * variant keys are deterministic (re-running overwrites identical files) and a READY media is
 * left untouched. A media that cannot be processed ends FAILED with a reason.
 */
export function mediaJobs(storage: MediaStorage | undefined): JobDefinition[] {
  return [
    defineJob({
      name: MEDIA_PROCESS_JOB,
      maxAttempts: MAX_ATTEMPTS,
      payload: z.object({ mediaId: z.uuid() }).strict(),
      handler: async ({ mediaId }, { db, logger, attempt }) => {
        const media = await db.media.findUnique({ where: { id: mediaId } });
        if (media?.status !== 'PROCESSING') return;
        const fail = async (reason: string) => {
          await db.media.update({
            where: { id: mediaId },
            data: { status: 'FAILED', failureReason: reason },
          });
        };
        if (!storage) {
          await fail('MEDIA_DISABLED');
          throw new NonRetryableJobError('Media storage is not configured');
        }
        try {
          const original = await storage.get(media.storageKey);
          const generated = await generateVariants(original);
          const variants = [];
          for (const variant of generated) {
            const key = mediaKey(
              media.storeId,
              media.id,
              `w${String(variant.width)}.${variant.format}`,
            );
            await storage.put(key, variant.data, MIME[variant.format]);
            variants.push({
              format: variant.format,
              width: variant.width,
              height: variant.height,
              bytes: variant.data.byteLength,
              key,
            });
          }
          await db.media.update({
            where: { id: mediaId },
            data: { status: 'READY', variants, failureReason: null },
          });
          logger.info({ mediaId, variants: variants.length }, 'media variants generated');
        } catch (error) {
          if (attempt >= MAX_ATTEMPTS) await fail('PROCESSING_FAILED');
          throw error;
        }
      },
    }),
  ];
}
