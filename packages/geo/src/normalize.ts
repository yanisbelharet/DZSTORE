// Name normalisation for MATCHING ONLY (skill dz-geo): never display or send a normalised
// name. Pure functions, usable in the browser.

const ARABIC_LETTER = /[ء-يٱ-ۓ]/u;
// Tashkil (harakat, tanwin, shadda, sukun), superscript alef, Quranic marks, tatweel.
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/gu;
const ARABIC_LETTER_MAP: Readonly<Record<string, string>> = {
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ٱ: 'ا',
  ة: 'ه',
  ى: 'ي',
  ؤ: 'و',
  ئ: 'ي',
};
const COMMUNE_PREFIX_AR = /^بلديه\s+/u;

export const hasArabic = (value: string): boolean => ARABIC_LETTER.test(value);

/** Arabic: no diacritics or tatweel, unified alef/ta marbuta/alif maqsura/hamza seats. */
export function normalizeArabic(value: string): string {
  const unified = value
    .normalize('NFC')
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآٱةىؤئ]/gu, (letter) => ARABIC_LETTER_MAP[letter] ?? letter)
    .replace(/\s+/gu, ' ')
    .trim();
  return unified.replace(COMMUNE_PREFIX_AR, '');
}

/** Article written apart (`El Kseur`, `Bab El Oued`) — dropped for matching. */
const ARTICLE = new Set(['el', 'al', 'l']);
/** Article assimilated to a sun letter (`Ezzouar` = `El Zouar`, `Ennasr` = `En Nasr`). */
const ASSIMILATED_ARTICLE = /^[ae]([bcdfghjklmnpqrstvwxz])\1/u;

/**
 * Latin: lower case, no accents, separators removed, article and common transliteration
 * variants unified (`ou`/`u`, `dj`/`j`, `sh`/`ch`, `aine`/`ain`, `ee`/`i`, double letters).
 */
export function normalizeLatin(value: string): string {
  const tokens = value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`\-_.]/gu, ' ')
    .replace(/[^a-z0-9 ]/gu, '')
    .split(/\s+/u)
    .filter((token) => token.length > 0 && !ARTICLE.has(token))
    .map((token) => token.replace(ASSIMILATED_ARTICLE, '$1'));
  return tokens
    .join('')
    .replace(/ou/gu, 'u')
    .replace(/dj/gu, 'j')
    .replace(/sh/gu, 'ch')
    .replace(/aine/gu, 'ain')
    .replace(/ee/gu, 'i')
    .replace(/([a-z])\1+/gu, '$1');
}

/** Comparison key of a place name, whatever its script. */
export const matchKey = (value: string): string =>
  hasArabic(value) ? normalizeArabic(value) : normalizeLatin(value);

/** Jaro-Winkler similarity in [0, 1] (fuzzy matching, always within one wilaya). */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const from = Math.max(0, i - window);
    const to = Math.min(b.length - 1, i + window);
    for (let j = from; j <= to; j += 1) {
      if (!bMatched[j] && a[i] === b[j]) {
        aMatched[i] = true;
        bMatched[j] = true;
        matches += 1;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }
  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
    prefix += 1;
  return jaro + prefix * 0.1 * (1 - jaro);
}
