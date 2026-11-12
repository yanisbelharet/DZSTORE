/**
 * Catalogue rules (PRD §5). Pure: the API passes plain data and translates the issues.
 */

export interface OptionDefinition {
  key: string;
  values: readonly { key: string }[];
}

export interface VariantFacts {
  sku: string;
  options: Readonly<Record<string, string>>;
  price: number;
  compareAtPrice: number | null;
  isActive: boolean;
}

export type VariantIssue =
  | { code: 'NO_OPTION_SINGLE_VARIANT'; count: number }
  | { code: 'OPTIONS_MISMATCH'; index: number }
  | { code: 'UNKNOWN_OPTION_VALUE'; index: number; option: string }
  | { code: 'DUPLICATE_COMBINATION'; index: number }
  | { code: 'DUPLICATE_SKU'; index: number }
  | { code: 'COMPARE_AT_NOT_ABOVE_PRICE'; index: number };

const comboKey = (options: Readonly<Record<string, string>>) =>
  Object.keys(options)
    .sort()
    .map((key) => `${key}=${options[key] ?? ''}`)
    .join('&');

/**
 * A product without options has exactly one variant (`{}`); with options, every variant gives
 * one known value per option, and no two variants share a combination or a SKU.
 */
export function validateVariants(
  options: readonly OptionDefinition[],
  variants: readonly VariantFacts[],
): VariantIssue[] {
  const issues: VariantIssue[] = [];
  if (options.length === 0 && variants.length !== 1) {
    issues.push({ code: 'NO_OPTION_SINGLE_VARIANT', count: variants.length });
  }
  const optionKeys = options.map((option) => option.key).sort();
  const combos = new Set<string>();
  const skus = new Set<string>();
  variants.forEach((variant, index) => {
    const keys = Object.keys(variant.options).sort();
    if (keys.join('|') !== optionKeys.join('|')) {
      issues.push({ code: 'OPTIONS_MISMATCH', index });
    } else {
      for (const option of options) {
        const value = variant.options[option.key];
        if (!option.values.some((candidate) => candidate.key === value)) {
          issues.push({ code: 'UNKNOWN_OPTION_VALUE', index, option: option.key });
        }
      }
    }
    const combo = comboKey(variant.options);
    if (combos.has(combo)) issues.push({ code: 'DUPLICATE_COMBINATION', index });
    combos.add(combo);
    if (skus.has(variant.sku)) issues.push({ code: 'DUPLICATE_SKU', index });
    skus.add(variant.sku);
    if (variant.compareAtPrice !== null && variant.compareAtPrice <= variant.price) {
      issues.push({ code: 'COMPARE_AT_NOT_ABOVE_PRICE', index });
    }
  });
  return issues;
}

export type PublishProblem =
  | { code: 'TITLE_MISSING'; locale: string }
  | { code: 'NO_ACTIVE_VARIANT' }
  | { code: 'ZERO_PRICE'; sku: string };

/**
 * What prevents a product from being sold: a title in every language of the store, at least
 * one active variant, and no active variant at 0 DZD (a COD order is never free).
 */
export function publishProblems(input: {
  titles: Readonly<Partial<Record<string, string>>>;
  storeLocales: readonly string[];
  variants: readonly Pick<VariantFacts, 'sku' | 'price' | 'isActive'>[];
}): PublishProblem[] {
  const problems: PublishProblem[] = [];
  for (const locale of input.storeLocales) {
    if (!input.titles[locale]?.trim()) problems.push({ code: 'TITLE_MISSING', locale });
  }
  const active = input.variants.filter((variant) => variant.isActive);
  if (active.length === 0) problems.push({ code: 'NO_ACTIVE_VARIANT' });
  for (const variant of active) {
    if (variant.price <= 0) problems.push({ code: 'ZERO_PRICE', sku: variant.sku });
  }
  return problems;
}

/**
 * First free value derived from `base` (duplication): `suffix(1)`, `suffix(2)`… appended to the
 * base, truncated so the result never exceeds `maxLength`.
 */
export function nextFreeValue(
  base: string,
  taken: ReadonlySet<string>,
  suffix: (attempt: number) => string,
  maxLength: number,
): string {
  for (let attempt = 1; attempt < 10_000; attempt += 1) {
    const end = suffix(attempt);
    const candidate = `${base.slice(0, Math.max(1, maxLength - end.length))}${end}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('No free value found');
}
