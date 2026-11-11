import { z } from 'zod';

import communesJson from '../data/communes.json' with { type: 'json' };
import wilayasJson from '../data/wilayas.json' with { type: 'json' };
import { matchKey } from './normalize.ts';

/** Reference data (SOURCE.md): 69 wilayas, 1541 communes — loi 84-09 modifiée par la loi 26-06. */
export const wilayaSchema = z.object({
  code: z.number().int().min(1).max(99),
  nameAr: z.string().min(1),
  nameFr: z.string().min(1),
  nameAscii: z.string().regex(/^[\x20-\x7e]+$/u),
});
export const communeSchema = z.object({
  id: z.number().int().positive(),
  wikidataId: z
    .string()
    .regex(/^Q\d+$/u)
    .nullable(),
  wilayaCode: z.number().int().min(1).max(99),
  nameAr: z.string().min(1),
  nameFr: z.string().min(1),
  nameAscii: z.string().regex(/^[\x20-\x7e]+$/u),
});
export type Wilaya = z.infer<typeof wilayaSchema>;
export type Commune = z.infer<typeof communeSchema>;

// Validated once at load: a corrupted data file fails loudly, never silently.
export const WILAYAS: readonly Wilaya[] = z.array(wilayaSchema).parse(wilayasJson);
export const COMMUNES: readonly Commune[] = z.array(communeSchema).parse(communesJson);

export const findWilaya = (code: number): Wilaya | undefined =>
  WILAYAS.find((w) => w.code === code);

export const communesOf = (wilayaCode: number): Commune[] =>
  COMMUNES.filter((c) => c.wilayaCode === wilayaCode);

/**
 * Commune of a wilaya by name, whatever the script or spelling variant (Arabic or Latin,
 * normalised for matching). Undefined when no commune of this wilaya matches.
 */
export function findCommune(wilayaCode: number, name: string): Commune | undefined {
  const key = matchKey(name);
  return communesOf(wilayaCode).find(
    (c) =>
      matchKey(c.nameFr) === key || matchKey(c.nameAr) === key || matchKey(c.nameAscii) === key,
  );
}
