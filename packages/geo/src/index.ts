export { hasArabic, jaroWinkler, matchKey, normalizeArabic, normalizeLatin } from './normalize.ts';
export { matchName } from './match.ts';
export type { MatchCandidate, MatchMethod, MatchOptions, MatchResult } from './match.ts';
export {
  COMMUNES,
  communeKeys,
  communeSchema,
  communesOf,
  findCommune,
  findCommuneInLegacyWilaya,
  findWilaya,
  geoAliasSchema,
  searchCommunes,
  WILAYAS,
  wilayaSchema,
} from './data.ts';
export type { Commune, GeoAlias, Wilaya } from './data.ts';
