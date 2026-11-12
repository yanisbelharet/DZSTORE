import { z } from 'zod';

/** Image types accepted at upload (the actual format is checked from the bytes, not the header). */
export const MEDIA_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export type MediaInputType = (typeof MEDIA_INPUT_TYPES)[number];

/**
 * Upload size limit: Vercel functions refuse bodies above 4.5 MB (test environment), and a
 * product photo never needs more once resized.
 */
export const MEDIA_MAX_BYTES = 4 * 1024 * 1024;

/** Widths of the generated variants (`srcset`); none is wider than the original. */
export const MEDIA_WIDTHS = [320, 640, 960, 1280, 1920] as const;
export const MEDIA_FORMATS = ['avif', 'webp'] as const;
export type MediaFormat = (typeof MEDIA_FORMATS)[number];

export const MEDIA_STATUSES = ['PROCESSING', 'READY', 'FAILED'] as const;

/** One generated file, as stored in `Media.variants`. */
export const mediaVariantSchema = z.object({
  format: z.enum(MEDIA_FORMATS),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  key: z.string().min(1),
});
export type MediaVariant = z.infer<typeof mediaVariantSchema>;

/** Alternative text per storefront language (`Media.alt`). */
export const mediaAltSchema = z
  .object({
    ar: z.string().trim().max(200).optional(),
    fr: z.string().trim().max(200).optional(),
  })
  .strict();
export type MediaAlt = z.infer<typeof mediaAltSchema>;

export const mediaSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  status: z.enum(MEDIA_STATUSES),
  mimeType: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  bytes: z.number().int(),
  alt: mediaAltSchema,
  /** Public URL of the sanitised original. */
  url: z.string(),
  variants: z.array(
    z.object({
      format: z.enum(MEDIA_FORMATS),
      width: z.number().int(),
      height: z.number().int(),
      url: z.string(),
    }),
  ),
  createdAt: z.string(),
});
export type MediaDto = z.infer<typeof mediaSchema>;

export const mediaListSchema = z.object({
  items: z.array(mediaSchema),
  nextCursor: z.string().nullable(),
});

/** Widths to generate for an original: every standard width below it, else its own width. */
export function variantWidths(originalWidth: number): number[] {
  const widths = MEDIA_WIDTHS.filter((width) => width <= originalWidth);
  return widths.length > 0 ? [...widths] : [originalWidth];
}
