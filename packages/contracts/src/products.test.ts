import { describe, expect, it } from 'vitest';

import {
  combinationKey,
  productInputSchema,
  productOptionsSchema,
  skuSchema,
  variantCombinations,
} from './products.ts';

const color = {
  key: 'color',
  name: { fr: 'Couleur', ar: 'اللون' },
  values: [
    { key: 'black', label: { fr: 'Noir' } },
    { key: 'white', label: { fr: 'Blanc' } },
  ],
};
const size = {
  key: 'size',
  name: { fr: 'Taille' },
  values: [
    { key: 's', label: { fr: 'S' } },
    { key: 'm', label: { fr: 'M' } },
    { key: 'l', label: { fr: 'L' } },
  ],
};

describe('produits (contrat)', () => {
  it('combinaisons d’options : produit cartésien, `[{}]` sans option', () => {
    expect(variantCombinations([])).toEqual([{}]);
    const combos = variantCombinations([color, size]);
    expect(combos).toHaveLength(6);
    expect(combos[0]).toEqual({ color: 'black', size: 's' });
    expect(combinationKey({ size: 'm', color: 'white' })).toBe('color=white&size=m');
  });

  it('options : clés uniques, 3 au plus', () => {
    expect(productOptionsSchema.safeParse([color, color]).success).toBe(false);
    expect(
      productOptionsSchema.safeParse([color, size, { ...size, key: 'a' }, { ...size, key: 'b' }])
        .success,
    ).toBe(false);
  });

  it('SKU en majuscules, slug ASCII, montants entiers', () => {
    expect(skuSchema.parse(' crm-50ml ')).toBe('CRM-50ML');
    expect(skuSchema.safeParse('a b').success).toBe(false);
    const base = {
      name: 'Crème',
      slug: 'creme-hydratante',
      content: { title: { fr: 'Crème' }, description: {} },
      variants: [{ sku: 'CRM', price: 2500, costPrice: 900 }],
    };
    const parsed = productInputSchema.parse(base);
    expect(parsed).toMatchObject({ status: 'DRAFT', options: [], media: [] });
    expect(parsed.variants[0]).toMatchObject({ compareAtPrice: null, isActive: true, options: {} });
    expect(productInputSchema.safeParse({ ...base, slug: 'Crème' }).success).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...base,
        variants: [{ sku: 'CRM', price: 25.5, costPrice: 1 }],
      }).success,
    ).toBe(false);
    expect(productInputSchema.safeParse({ ...base, storeId: 'x' }).success).toBe(false);
  });
});
