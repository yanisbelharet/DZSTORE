// Builds data/wilayas.json and data/communes.json from the sources in ../sources (SOURCE.md).
// Usage: node packages/geo/scripts/build-dataset.ts   (prints a report; fails on any doubt)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { jaroWinkler, normalizeArabic, normalizeLatin } from '../src/normalize.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(root, file), 'utf8')) as T;

interface LawArticle {
  article: number;
  bis: number | null;
  declared: number;
  names: [number, string][];
}
interface WikidataCommune {
  id: string;
  ar: string | null;
  fr: string | null;
  en: string | null;
  wilaya58: number | null;
}
interface WikidataWilaya {
  code: number;
  ar: string | null;
  fr: string | null;
}

interface Overrides {
  /** `<wilaya>:<official name>` → Wikidata item, when spellings differ too much to match. */
  aliases: Record<string, { id: string; source: string }>;
  /** Arabic name for an item that has none in Wikidata. */
  arabic: Record<string, { ar: string; source: string }>;
  /** Communes missing from the Wikidata extract. */
  extra: (WikidataCommune & { source: string })[];
  /** Wikidata items that are not communes (duplicates, junk). */
  exclude: Record<string, string>;
  /** Communes renamed by law: new Arabic name (if known) and former names kept as aliases. */
  renames: Record<
    string,
    {
      ar?: string;
      former: { lang: 'ar' | 'fr'; name: string }[];
      toVerify?: string;
      source: string;
    }
  >;
  /** Extra spellings in use (not renames). */
  variants: Record<string, { lang: 'ar' | 'fr'; name: string }[]>;
  /** Entries to check against another source. */
  toVerify: Record<string, string>;
}
const overrides = read<Overrides>('sources/overrides.json');
const law2019 = read<LawArticle[]>('sources/jora-2019-078-loi-19-12.json');
const law2026 = read<LawArticle[]>('sources/jora-2026-025-loi-26-06.json');
const extract = read<{ communes: WikidataCommune[]; wilayas: WikidataWilaya[] }>(
  'sources/wikidata-2026-11-11.json',
);
const wikidata = {
  wilayas: extract.wilayas,
  communes: [
    ...extract.communes
      .filter((c) => overrides.exclude[c.id] === undefined)
      // A reviewed Arabic name wins over Wikidata (missing or wrong label).
      .map((c) => ({ ...c, ar: overrides.arabic[c.id]?.ar ?? c.ar })),
    ...overrides.extra,
  ],
};

// Loi 84-09: article N = wilaya N - 4; « 52 bis » (2019) = 49, « 52 bis k » = 49 + k.
const codeOf2019 = (a: LawArticle) => (a.bis === null ? a.article - 4 : 49 + a.bis);
const codeOf2026 = (a: LawArticle) => (a.bis === null ? a.article - 4 : 49 + a.bis);
/** Wilaya each 2026 wilaya was carved out of (communes listed by the law, Wikidata pre-reform). */
const MOTHER: Readonly<Record<number, number>> = {
  // Loi 19-12 (2019)
  49: 1,
  50: 1,
  51: 7,
  52: 8,
  53: 11,
  54: 11,
  55: 30,
  56: 33,
  57: 39,
  58: 47,
  // Loi 26-06 (2026)
  59: 3,
  60: 5,
  61: 7,
  62: 12,
  63: 13,
  64: 14,
  65: 17,
  66: 17,
  67: 26,
  68: 28,
  69: 32,
};
const WILAYA_COUNT = 69;
const COMMUNE_COUNT = 1541; // Loi n° 26-06, art. 3 (84-09 modifiée)

const official = new Map<number, string[]>();
for (const a of law2019)
  official.set(
    codeOf2019(a),
    a.names.map(([, name]) => name),
  );
for (const a of law2026)
  official.set(
    codeOf2026(a),
    a.names.map(([, name]) => name),
  );
for (const a of [...law2019, ...law2026]) {
  if (a.names.length !== a.declared)
    throw new Error(`Article ${String(a.article)}: count mismatch`);
}

const stripCommune = (label: string) => label.replace(/\s*\(.*\)\s*$/u, '').trim();
const ascii = (name: string) =>
  name.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’`]/gu, "'").replace(/\s+/gu, ' ').trim();
const latinKeys = (c: WikidataCommune) =>
  [c.fr, c.en].filter((v): v is string => v !== null).map((v) => normalizeLatin(stripCommune(v)));

const used = new Set<string>();
const report: string[] = [];
const problems: string[] = [];

/** Finds the Wikidata commune of an official (law) name within the expected pre-reform wilayas. */
function match(name: string, pool: WikidataCommune[]): WikidataCommune | undefined {
  const key = normalizeLatin(name);
  const free = pool.filter((c) => !used.has(c.id));
  const allExact = free.filter((c) => latinKeys(c).includes(key));
  // Wikidata has a few duplicate items: prefer the complete one (with an Arabic label).
  const complete = allExact.filter((c) => c.ar !== null);
  const exact = complete.length > 0 ? complete : allExact;
  if (exact.length === 1 && exact[0]) return exact[0];
  if (exact.length > 1) {
    problems.push(`ambiguous: ${name} → ${exact.map((c) => c.id).join(', ')}`);
    return undefined;
  }
  const scored = free
    .map((c) => ({ c, score: Math.max(...latinKeys(c).map((k) => jaroWinkler(key, k))) }))
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < 0.88 || (second && second.score > best.score - 0.03)) {
    problems.push(
      `no match: "${name}" (best: ${best ? `${best.c.fr ?? best.c.en ?? best.c.id} ${best.c.id} ${best.score.toFixed(3)}` : 'none'})`,
    );
    return undefined;
  }
  report.push(`fuzzy: ${name} ≈ ${best.c.fr ?? ''} (${best.score.toFixed(3)})`);
  return best.c;
}

/** Stable integer id: the Wikidata item number (X… = reserved ids for communes not in Wikidata). */
const numericId = (id: string) => Number(id.slice(1));

interface Alias {
  lang: 'ar' | 'fr';
  name: string;
  /** FORMER_NAME: renamed by law; VARIANT: other spelling in use (sources, carriers). */
  kind: 'FORMER_NAME' | 'VARIANT';
}
interface Commune {
  id: number;
  wikidataId: string | null;
  wilayaCode: number;
  /** Wilaya in the 58-wilaya model (2019–2026): carriers and customers still use it. */
  legacyWilayaCode: number;
  nameAr: string;
  nameFr: string;
  nameAscii: string;
  aliases: Alias[];
  /** Why this entry must be checked against another source (null = verified). */
  toVerify: string | null;
}
const communes: Commune[] = [];

function addCommune(wilayaCode: number, nameFr: string, source: WikidataCommune) {
  if (used.has(source.id)) problems.push(`used twice: ${source.id} (${nameFr})`);
  used.add(source.id);
  if (!source.ar) {
    problems.push(`no arabic: ${source.id} ${nameFr} (wilaya ${String(wilayaCode)})`);
    return;
  }
  const legacyWilayaCode = wilayaCode <= 58 ? wilayaCode : MOTHER[wilayaCode];
  if (legacyWilayaCode === undefined) problems.push(`no legacy wilaya for ${String(wilayaCode)}`);
  const sourceAr = normalizeSpaces(source.ar.replace(/^بلدية\s+/u, ''));
  const renamed = overrides.renames[source.id];
  const nameAr = renamed?.ar ?? sourceAr;
  const aliases: Alias[] = [];
  const addAlias = (alias: Alias) => {
    const key = alias.lang === 'ar' ? normalizeArabic(alias.name) : normalizeLatin(alias.name);
    const own = alias.lang === 'ar' ? normalizeArabic(nameAr) : normalizeLatin(nameFr);
    if (
      key === own ||
      aliases.some(
        (a) =>
          a.lang === alias.lang &&
          (a.lang === 'ar' ? normalizeArabic(a.name) : normalizeLatin(a.name)) === key,
      )
    )
      return;
    aliases.push(alias);
  };
  // Former names declared for a rename by law (AR and FR), then other spellings from Wikidata.
  for (const former of renamed?.former ?? []) addAlias({ ...former, kind: 'FORMER_NAME' });
  if (sourceAr !== nameAr) addAlias({ lang: 'ar', name: sourceAr, kind: 'FORMER_NAME' });
  for (const label of [source.fr, source.en]) {
    if (label)
      addAlias({
        lang: 'fr',
        name: normalizeSpaces(label),
        kind: renamed ? 'FORMER_NAME' : 'VARIANT',
      });
  }
  for (const variant of overrides.variants[source.id] ?? [])
    addAlias({ ...variant, kind: 'VARIANT' });
  communes.push({
    id: numericId(source.id),
    wikidataId: source.id.startsWith('Q') ? source.id : null,
    wilayaCode,
    legacyWilayaCode: legacyWilayaCode ?? wilayaCode,
    nameAr,
    nameFr: nameFr.trim(),
    nameAscii: ascii(nameFr),
    aliases,
    toVerify: overrides.toVerify[source.id] ?? renamed?.toVerify ?? null,
  });
}
const normalizeSpaces = (value: string) => stripCommune(value).replace(/\s+/gu, ' ').trim();

// Wilayas with an official list (2019, then 2026) first, so that their communes are claimed.
for (const [code, names] of [...official.entries()].sort(([a], [b]) => a - b)) {
  const mother = MOTHER[code];
  // Wikidata already moved some communes to their 2026 wilaya (no ISO code yet ⇒ unassigned).
  const pool = wikidata.communes.filter(
    (c) =>
      c.wilaya58 === code || c.wilaya58 === null || (mother !== undefined && c.wilaya58 === mother),
  );
  for (const name of names) {
    const alias = overrides.aliases[`${String(code)}:${name}`];
    const aliased = alias && wikidata.communes.find((c) => c.id === alias.id);
    if (alias && !aliased) problems.push(`alias target missing: ${alias.id}`);
    const found = aliased || match(name, pool);
    if (found) addCommune(code, name, found);
  }
}
// Wilayas untouched since 1984: Wikidata membership.
for (let code = 1; code <= 58; code += 1) {
  if (official.has(code)) continue;
  for (const c of wikidata.communes.filter((item) => item.wilaya58 === code)) {
    addCommune(code, normalizeSpaces(c.fr ?? c.en ?? ''), c);
  }
}

const wilayaName = (label: string | null, prefix: RegExp) =>
  normalizeSpaces((label ?? '').replace(prefix, ''));
const wilayas = Array.from({ length: WILAYA_COUNT }, (_, index) => {
  const code = index + 1;
  // A wilaya is named after its chef-lieu: the first commune of its official list.
  const chefLieu = official.get(code)?.[0];
  const commune =
    chefLieu === undefined
      ? undefined
      : communes.find((c) => c.wilayaCode === code && c.nameFr === chefLieu);
  const wd = wikidata.wilayas.find((w) => w.code === code);
  const nameFr =
    commune?.nameFr ?? wilayaName(wd?.fr ?? null, /^wilaya\s+(?:de\s+|d['’]\s*|du\s+)?/iu);
  const nameAr = commune?.nameAr ?? wilayaName(wd?.ar ?? null, /^ولاية\s+/u);
  if (!nameFr || !nameAr) problems.push(`wilaya ${String(code)} has no name`);
  return { code, nameAr, nameFr, nameAscii: ascii(nameFr) };
});

if (problems.length > 0) {
  process.stderr.write(`${String(problems.length)} problems:\n${problems.join('\n')}\n`);
  process.exit(1);
}

// Checks (skill dz-geo): counts, every commune attached, no duplicate (wilaya, normalized name).
if (communes.length !== COMMUNE_COUNT) {
  const counts = new Map<number, number>();
  for (const c of communes) counts.set(c.wilayaCode, (counts.get(c.wilayaCode) ?? 0) + 1);
  process.stderr.write(
    `${JSON.stringify(Object.fromEntries([...counts].sort(([a], [b]) => a - b)))}\n`,
  );
  throw new Error(`Expected ${String(COMMUNE_COUNT)} communes, got ${String(communes.length)}`);
}
const seen = new Set<string>();
for (const c of communes) {
  if (c.wilayaCode < 1 || c.wilayaCode > WILAYA_COUNT) throw new Error(`Bad wilaya for ${c.id}`);
  for (const key of [`fr:${normalizeLatin(c.nameFr)}`, `ar:${normalizeArabic(c.nameAr)}`]) {
    const unique = `${String(c.wilayaCode)}:${key}`;
    if (seen.has(unique)) throw new Error(`Duplicate in wilaya ${String(c.wilayaCode)}: ${key}`);
    seen.add(unique);
  }
}
for (const w of wilayas) {
  if (!communes.some((c) => c.wilayaCode === w.code))
    throw new Error(`Empty wilaya ${String(w.code)}`);
}

communes.sort(
  (a, b) => a.wilayaCode - b.wilayaCode || a.nameAscii.localeCompare(b.nameAscii, 'fr'),
);
writeFileSync(path.join(root, 'data/wilayas.json'), `${JSON.stringify(wilayas, null, 1)}\n`);
writeFileSync(path.join(root, 'data/communes.json'), `${JSON.stringify(communes, null, 1)}\n`);
process.stdout.write(
  `${String(wilayas.length)} wilayas, ${String(communes.length)} communes; ${String(report.length)} fuzzy matches\n${report.join('\n')}\n`,
);
