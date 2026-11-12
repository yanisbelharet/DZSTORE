import { z } from 'zod';

import { mediaSchema } from './media.ts';

/** Text per storefront language; a language may be missing (checked when publishing). */
export const localizedText = (max: number) =>
  z
    .object({
      ar: z.string().trim().min(1).max(max).optional(),
      fr: z.string().trim().min(1).max(max).optional(),
    })
    .strict();
export type LocalizedText = z.infer<ReturnType<typeof localizedText>>;

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const productStatusSchema = z.enum(PRODUCT_STATUSES);

/** URL slug: lower-case ASCII words separated by hyphens (safe in ad links). */
export const productSlugSchema = z
  .string()
  .trim()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, {
    error: 'expected lower-case letters, digits and hyphens',
  });

/** Stock keeping unit: unique per store, upper-cased. */
export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9._-]{0,63}$/u, { error: 'expected letters, digits, . _ -' });

/** Amount in dinars (DZD, integer). */
export const dzdSchema = z.number().int().min(0).max(100_000_000);

const optionKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,29}$/u);

const unique = (values: readonly string[]) => new Set(values).size === values.length;

/** Product option (colour, size…) with its localised values; at most 3 options. */
export const productOptionSchema = z.object({
  key: optionKey,
  name: localizedText(40),
  values: z
    .array(z.object({ key: optionKey, label: localizedText(40) }))
    .min(1)
    .max(30)
    .refine((values) => unique(values.map((v) => v.key)), { error: 'duplicate value key' }),
});
export type ProductOption = z.infer<typeof productOptionSchema>;

export const productOptionsSchema = z
  .array(productOptionSchema)
  .max(3)
  .refine((options) => unique(options.map((o) => o.key)), { error: 'duplicate option key' });

export const productContentSchema = z.object({
  title: localizedText(150),
  description: localizedText(5000),
});
export type ProductContent = z.infer<typeof productContentSchema>;

export const productSeoSchema = z.object({
  title: localizedText(70),
  description: localizedText(160),
  /** Image shared on social networks (Open Graph); defaults to the first product image. */
  ogImageMediaId: z.uuid().nullable(),
});
export type ProductSeo = z.infer<typeof productSeoSchema>;

export const variantInputSchema = z.object({
  /** Existing variant (kept, with its identifier); absent for a new one. */
  id: z.uuid().optional(),
  sku: skuSchema,
  /** Option key → value key (`{}` for a product without options). */
  options: z.record(optionKey, optionKey).default({}),
  price: dzdSchema,
  compareAtPrice: dzdSchema.nullable().default(null),
  costPrice: dzdSchema,
  weightGrams: z.number().int().min(1).max(100_000).nullable().default(null),
  carrierProductRef: z.string().trim().min(1).max(64).nullable().default(null),
  isActive: z.boolean().default(true),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

/** Full product as saved by the back office (create and replace). */
export const productInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: productSlugSchema,
    status: productStatusSchema.default('DRAFT'),
    content: productContentSchema,
    options: productOptionsSchema.default([]),
    variants: z.array(variantInputSchema).min(1).max(100),
    /** Ordered images; `variantSku` attaches an image to one variant (shown when chosen). */
    media: z
      .array(z.object({ mediaId: z.uuid(), variantSku: skuSchema.nullable().default(null) }))
      .max(30)
      .refine((items) => unique(items.map((m) => m.mediaId)), { error: 'duplicate image' })
      .default([]),
    seo: productSeoSchema.default({ title: {}, description: {}, ogImageMediaId: null }),
  })
  .strict();
export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductInputDraft = z.input<typeof productInputSchema>;

export const productUpdateSchema = productInputSchema.extend({
  /** Optimistic concurrency: `updatedAt` of the version being edited. */
  expectedUpdatedAt: z.iso.datetime(),
});

export const productStatusUpdateSchema = z.object({ status: productStatusSchema }).strict();

export const productVariantSchema = z.object({
  id: z.string(),
  sku: z.string(),
  options: z.record(z.string(), z.string()),
  price: z.number().int(),
  compareAtPrice: z.number().int().nullable(),
  /** `null` when the caller may not see costs (`finance.read`). */
  costPrice: z.number().int().nullable(),
  weightGrams: z.number().int().nullable(),
  carrierProductRef: z.string().nullable(),
  isActive: z.boolean(),
  position: z.number().int(),
});
export type ProductVariantDto = z.infer<typeof productVariantSchema>;

export const productSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  slug: z.string(),
  name: z.string(),
  status: productStatusSchema,
  content: productContentSchema,
  options: z.array(productOptionSchema),
  seo: productSeoSchema,
  variants: z.array(productVariantSchema),
  media: z.array(
    z.object({ media: mediaSchema, variantId: z.string().nullable(), position: z.number().int() }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProductDto = z.infer<typeof productSchema>;

export const productSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: productStatusSchema,
  variantCount: z.number().int(),
  /** Price range of the active variants (null when none is active). */
  priceMin: z.number().int().nullable(),
  priceMax: z.number().int().nullable(),
  coverUrl: z.string().nullable(),
  updatedAt: z.string(),
});
export type ProductSummary = z.infer<typeof productSummarySchema>;

export const productListSchema = z.object({
  items: z.array(productSummarySchema),
  nextCursor: z.string().nullable(),
});

/** Every combination of option values, in option order (`[{}]` without options). */
export function variantCombinations(options: readonly ProductOption[]): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>(
    (combos, option) =>
      combos.flatMap((combo) =>
        option.values.map((value) => ({ ...combo, [option.key]: value.key })),
      ),
    [{}],
  );
}

/** Stable identity of a combination, independent of key order. */
export const combinationKey = (combination: Readonly<Record<string, string>>): string =>
  Object.keys(combination)
    .sort()
    .map((key) => `${key}=${combination[key] ?? ''}`)
    .join('&');
