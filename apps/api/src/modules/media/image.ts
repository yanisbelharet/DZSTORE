import { MEDIA_FORMATS, variantWidths } from '@dz/contracts';
import type { MediaFormat, MediaInputType } from '@dz/contracts';
import { AppError } from '@dz/core/errors';
import sharp from 'sharp';
import type { Metadata, Sharp } from 'sharp';

/** Decompression-bomb guard: 40 megapixels is far above any product photo. */
const MAX_PIXELS = 40_000_000;

const OUTPUT: Record<MediaInputType, { ext: string; encode: (image: Sharp) => Sharp }> = {
  'image/jpeg': { ext: 'jpg', encode: (image) => image.jpeg({ quality: 90, mozjpeg: true }) },
  'image/png': { ext: 'png', encode: (image) => image.png({ compressionLevel: 9 }) },
  'image/webp': { ext: 'webp', encode: (image) => image.webp({ quality: 90 }) },
  'image/avif': { ext: 'avif', encode: (image) => image.avif({ quality: 70 }) },
};

const VARIANT_ENCODERS: Record<MediaFormat, (image: Sharp) => Sharp> = {
  avif: (image) => image.avif({ quality: 50, effort: 4 }),
  webp: (image) => image.webp({ quality: 75 }),
};

const invalid = () =>
  new AppError('UNSUPPORTED_MEDIA_TYPE', 'Expected a JPEG, PNG, WebP or AVIF image', {
    details: { field: 'file' },
  });

/** Actual type from the bytes (the Content-Type header is only a claim). */
function detectType(metadata: Metadata): MediaInputType | undefined {
  switch (metadata.format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heif':
      return metadata.compression === 'av1' ? 'image/avif' : undefined;
    default:
      return undefined;
  }
}

export interface SanitizedImage {
  data: Buffer;
  mimeType: MediaInputType;
  ext: string;
  width: number;
  height: number;
}

/**
 * Validates an uploaded image and returns a clean original: EXIF orientation applied, every
 * metadata block (GPS position, camera, comments) removed, first frame only.
 */
export async function sanitizeImage(input: Uint8Array): Promise<SanitizedImage> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw invalid();
  }
  const mimeType = detectType(metadata);
  if (mimeType === undefined) throw invalid();
  if (metadata.width * metadata.height > MAX_PIXELS) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'Image dimensions are too large', {
      details: { field: 'file', maxPixels: MAX_PIXELS },
    });
  }
  const output = OUTPUT[mimeType];
  try {
    // sharp drops all metadata unless `withMetadata()` is called.
    const { data, info } = await output
      .encode(sharp(input, { limitInputPixels: MAX_PIXELS, animated: false }).rotate())
      .toBuffer({ resolveWithObject: true });
    return { data, mimeType, ext: output.ext, width: info.width, height: info.height };
  } catch {
    throw invalid();
  }
}

export interface GeneratedVariant {
  format: MediaFormat;
  width: number;
  height: number;
  data: Buffer;
}

/** AVIF + WebP at every standard width up to the original's (`srcset`). */
export async function generateVariants(original: Buffer): Promise<GeneratedVariant[]> {
  const { width } = await sharp(original).metadata();
  const variants: GeneratedVariant[] = [];
  for (const targetWidth of variantWidths(width)) {
    for (const format of MEDIA_FORMATS) {
      const { data, info } = await VARIANT_ENCODERS[format](
        sharp(original).resize({ width: targetWidth, withoutEnlargement: true }),
      ).toBuffer({ resolveWithObject: true });
      variants.push({ format, width: info.width, height: info.height, data });
    }
  }
  return variants;
}
