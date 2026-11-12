import { describe, expect, it } from 'vitest';

import { nextFreeValue, publishProblems, validateVariants } from './catalog.ts';

const color = { key: 'color', values: [{ key: 'black' }, { key: 'white' }] };
const variant = (sku: string, options: Record<string, string> = {}, price = 2500) => ({
  sku,
  options,
  price,
  compareAtPrice: null,
  isActive: true,
});

describe('catalogue : cohérence des variantes', () => {
  it('sans option : une seule variante', () => {
    expect(validateVariants([], [variant('A')])).toEqual([]);
    expect(validateVariants([], [variant('A'), variant('B')])).toContainEqual({
      code: 'NO_OPTION_SINGLE_VARIANT',
      count: 2,
    });
  });

  it('avec options : une valeur connue par option, combinaisons et SKU uniques', () => {
    expect(
      validateVariants(
        [color],
        [variant('A', { color: 'black' }), variant('B', { color: 'white' })],
      ),
    ).toEqual([]);
    expect(validateVariants([color], [variant('A')])).toEqual([
      { code: 'OPTIONS_MISMATCH', index: 0 },
    ]);
    expect(validateVariants([color], [variant('A', { color: 'red' })])).toEqual([
      { code: 'UNKNOWN_OPTION_VALUE', index: 0, option: 'color' },
    ]);
    expect(
      validateVariants(
        [color],
        [variant('A', { color: 'black' }), variant('A', { color: 'black' })],
      ),
    ).toEqual([
      { code: 'DUPLICATE_COMBINATION', index: 1 },
      { code: 'DUPLICATE_SKU', index: 1 },
    ]);
  });

  it('prix barré strictement supérieur au prix', () => {
    expect(validateVariants([], [{ ...variant('A'), compareAtPrice: 2500 }])).toEqual([
      { code: 'COMPARE_AT_NOT_ABOVE_PRICE', index: 0 },
    ]);
    expect(validateVariants([], [{ ...variant('A'), compareAtPrice: 3000 }])).toEqual([]);
  });
});

describe('catalogue : publication', () => {
  it('titre dans chaque langue de la boutique, une variante active à prix non nul', () => {
    expect(
      publishProblems({
        titles: { ar: 'كريم', fr: 'Crème' },
        storeLocales: ['ar', 'fr'],
        variants: [variant('A')],
      }),
    ).toEqual([]);
    expect(
      publishProblems({
        titles: { fr: 'Crème', ar: '  ' },
        storeLocales: ['ar', 'fr'],
        variants: [variant('A', {}, 0), { ...variant('B'), isActive: false }],
      }),
    ).toEqual([
      { code: 'TITLE_MISSING', locale: 'ar' },
      { code: 'ZERO_PRICE', sku: 'A' },
    ]);
    expect(
      publishProblems({
        titles: { ar: 'x' },
        storeLocales: ['ar'],
        variants: [{ ...variant('A'), isActive: false }],
      }),
    ).toEqual([{ code: 'NO_ACTIVE_VARIANT' }]);
  });
});

describe('catalogue : valeurs libres pour la duplication', () => {
  it('suffixe incrémenté, longueur maximale respectée', () => {
    const slug = (n: number) => (n === 1 ? '-copie' : `-copie-${String(n)}`);
    expect(nextFreeValue('creme', new Set(), slug, 80)).toBe('creme-copie');
    expect(nextFreeValue('creme', new Set(['creme-copie']), slug, 80)).toBe('creme-copie-2');
    expect(nextFreeValue('ABCDEFGH', new Set(), (n) => `-C${String(n)}`, 8)).toBe('ABCDE-C1');
  });
});
