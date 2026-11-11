import { z } from 'zod';

import communesJson from '../data/communes.json' with { type: 'json' };
import wilayasJson from '../data/wilayas.json' with { type: 'json' };
import { matchKey } from './normalize.ts';

/**
 * Reference data (SOURCE.md): 69 wilayas, 1541 communes — loi 84-09 modifiée par la loi 26-06 ;
 * codes 59 à 69 fixés par le décret présidentiel n° 26-206 du 25 mai 2026 (ADR-0026).
 */
export const wilayaSchema = z.object({
  code: z.number().int().min(1).max(99),
  nameAr: z.string().min(1),
  nameFr: z.string().min(1),
  nameAscii: z.string().regex(/^[\x20-\x7e]+$/u),
});
export const geoAliasSchema = z.object({
  lang: z.enum(['ar', 'fr']),
  name: z.string().min(1),
  /** FORMER_NAME: renamed by law; VARIANT: other spelling in use (customers, carriers). */
  kind: z.enum(['FORMER_NAME', 'VARIANT']),
});
export const communeSchema = z.object({
  /** Internal stable id (Wikidata item number): never changes when a commune changes wilaya. */
  id: z.number().int().positive(),
  wikidataId: z
    .string()
    .regex(/^Q\d+$/u)
    .nullable(),
  wilayaCode: z.number().int().min(1).max(99),
  /** Wilaya in the 58-wilaya model (2019–2026), still used by carriers and customers. */
  legacyWilayaCode: z.number().int().min(1).max(58),
  nameAr: z.string().min(1),
  nameFr: z.string().min(1),
  nameAscii: z.string().regex(/^[\x20-\x7e]+$/u),
  aliases: z.array(geoAliasSchema),
  /** Reason to check this entry against another source (null = verified). */
  toVerify: z.string().nullable(),
});
export type Wilaya = z.infer<typeof wilayaSchema>;
export type GeoAlias = z.infer<typeof geoAliasSchema>;
export type Commune = z.infer<typeof communeSchema>;

// Validated once at load: a corrupted data file fails loudly, never silently.
export const WILAYAS: readonly Wilaya[] = z.array(wilayaSchema).parse(wilayasJson);
export const COMMUNES: readonly Commune[] = z.array(communeSchema).parse(communesJson);

export const findWilaya = (code: number): Wilaya | undefined =>
  WILAYAS.find((w) => w.code === code);

export const communesOf = (wilayaCode: number): Commune[] =>
  COMMUNES.filter((c) => c.wilayaCode === wilayaCode);

/** Every comparison key of a commune: current names and aliases, in both scripts. */
export function communeKeys(commune: Commune): string[] {
  return [
    commune.nameFr,
    commune.nameAr,
    commune.nameAscii,
    ...commune.aliases.map((alias) => alias.name),
  ].map(matchKey);
}

/**
 * Commune of a wilaya by name, whatever the script, spelling variant or former name.
 * Undefined when no commune of this wilaya matches.
 */
export function findCommune(wilayaCode: number, name: string): Commune | undefined {
  const key = matchKey(name);
  return communesOf(wilayaCode).find((c) => communeKeys(c).includes(key));
}

/**
 * Same lookup in the 58-wilaya model: a carrier (or a habit) still says « Laghouat » for a
 * commune now in Aflou (59).
 */
export function findCommuneInLegacyWilaya(
  legacyWilayaCode: number,
  name: string,
): Commune | undefined {
  const key = matchKey(name);
  return COMMUNES.find(
    (c) => c.legacyWilayaCode === legacyWilayaCode && communeKeys(c).includes(key),
  );
}

/** Communes of any wilaya whose name (or alias) matches: suggests the right wilaya. */
export function searchCommunes(name: string): Commune[] {
  const key = matchKey(name);
  if (key.length === 0) return [];
  return COMMUNES.filter((c) => communeKeys(c).includes(key));
}
