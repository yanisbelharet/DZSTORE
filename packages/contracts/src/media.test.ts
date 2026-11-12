import { describe, expect, it } from 'vitest';

import { mediaAltSchema, mediaVariantSchema, variantWidths } from './media.ts';

describe('médias', () => {
  it('largeurs des variantes : jamais plus large que l’original', () => {
    expect(variantWidths(4000)).toEqual([320, 640, 960, 1280, 1920]);
    expect(variantWidths(1000)).toEqual([320, 640, 960]);
    expect(variantWidths(640)).toEqual([320, 640]);
    expect(variantWidths(200)).toEqual([200]);
  });

  it('texte alternatif par langue, borné, sans champ inconnu', () => {
    expect(mediaAltSchema.parse({ ar: ' كريم ', fr: 'Crème' })).toEqual({
      ar: 'كريم',
      fr: 'Crème',
    });
    expect(mediaAltSchema.safeParse({ en: 'Cream' }).success).toBe(false);
    expect(mediaAltSchema.safeParse({ fr: 'x'.repeat(201) }).success).toBe(false);
  });

  it('variante stockée : format et dimensions contrôlés', () => {
    const ok = { format: 'avif', width: 640, height: 480, bytes: 1000, key: 'k' };
    expect(mediaVariantSchema.parse(ok)).toEqual(ok);
    expect(mediaVariantSchema.safeParse({ ...ok, format: 'gif' }).success).toBe(false);
  });
});
