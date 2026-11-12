import {
  productContentSchema,
  productOptionsSchema,
  productSeoSchema,
  STORE_LOCALES,
} from '@dz/contracts';
import type {
  ProductDto,
  ProductInput,
  ProductStatus,
  ProductSummary,
  VariantInput,
} from '@dz/contracts';
import { AppError } from '@dz/core/errors';
import type { DbClient, DbTransaction, Prisma } from '@dz/db';
import { nextFreeValue, publishProblems, validateVariants } from '@dz/domain';

import { recordAudit } from '../audit/audit.ts';
import { toMediaDto } from '../media/service.ts';
import type { MediaStorage } from '../media/storage.ts';

export const productInclude = {
  variants: { orderBy: { position: 'asc' } },
  media: { orderBy: { position: 'asc' }, include: { media: true } },
} as const satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export interface ProductsDependencies {
  db: DbClient;
  storage: MediaStorage | undefined;
}

export interface Actor {
  userId: string;
  /** Cost prices are only returned to callers allowed to read finance data. */
  canSeeCost: boolean;
}

// Stored JSON is validated when read: a corrupted value degrades to an empty one, never a 500.
const contentOf = (value: Prisma.JsonValue) =>
  productContentSchema.safeParse(value).data ?? { title: {}, description: {} };
const optionsOf = (value: Prisma.JsonValue) => productOptionsSchema.safeParse(value).data ?? [];
const seoOf = (value: Prisma.JsonValue) =>
  productSeoSchema.safeParse(value).data ?? { title: {}, description: {}, ogImageMediaId: null };
const variantOptionsOf = (value: Prisma.JsonValue): Record<string, string> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

export function toProductDto(
  product: ProductRow,
  storage: MediaStorage | undefined,
  { canSeeCost }: { canSeeCost: boolean },
): ProductDto {
  return {
    id: product.id,
    storeId: product.storeId,
    slug: product.slug,
    name: product.name,
    status: product.status,
    content: contentOf(product.content),
    options: optionsOf(product.options),
    seo: seoOf(product.seo),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      options: variantOptionsOf(variant.options),
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      costPrice: canSeeCost ? variant.costPrice : null,
      weightGrams: variant.weightGrams,
      carrierProductRef: variant.carrierProductRef,
      isActive: variant.isActive,
      position: variant.position,
    })),
    media: product.media.map((link) => ({
      media: toMediaDto(link.media, storage),
      variantId: link.variantId,
      position: link.position,
    })),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export async function getProduct(db: DbClient | DbTransaction, storeId: string, id: string) {
  const product = await db.product.findFirst({ where: { id, storeId }, include: productInclude });
  if (!product) throw new AppError('NOT_FOUND', 'Resource not found');
  return product;
}

const invalid = (reason: string, details: Record<string, unknown> = {}) =>
  new AppError('VALIDATION_FAILED', 'The product is not valid', {
    details: { reason, ...details },
  });

async function storeLocales(tx: DbTransaction, storeId: string): Promise<string[]> {
  const store = await tx.store.findUnique({ where: { id: storeId }, select: { locales: true } });
  if (!store) throw new AppError('NOT_FOUND', 'Resource not found');
  return store.locales.filter((locale) => (STORE_LOCALES as readonly string[]).includes(locale));
}

function assertPublishable(
  status: ProductStatus,
  titles: Partial<Record<string, string>>,
  locales: readonly string[],
  variants: readonly { sku: string; price: number; isActive: boolean }[],
) {
  if (status !== 'ACTIVE') return;
  const problems = publishProblems({ titles, storeLocales: locales, variants });
  if (problems.length > 0) throw invalid('NOT_PUBLISHABLE', { problems });
}

/** Everything that depends on other rows: images, SKU and slug uniqueness, variant ownership. */
async function assertConsistent(
  tx: DbTransaction,
  storeId: string,
  input: ProductInput,
  productId: string | undefined,
  existingVariantIds: ReadonlySet<string>,
) {
  const issues = validateVariants(input.options, input.variants);
  if (issues.length > 0) throw invalid('INVALID_VARIANTS', { issues });

  for (const variant of input.variants) {
    if (variant.id !== undefined && !existingVariantIds.has(variant.id)) {
      throw invalid('UNKNOWN_VARIANT', { field: 'variants' });
    }
  }
  const skus = new Set(input.variants.map((variant) => variant.sku));
  for (const link of input.media) {
    if (link.variantSku !== null && !skus.has(link.variantSku)) {
      throw invalid('UNKNOWN_VARIANT_SKU', { field: 'media', sku: link.variantSku });
    }
  }
  const mediaIds = new Set(input.media.map((link) => link.mediaId));
  if (input.seo.ogImageMediaId !== null) mediaIds.add(input.seo.ogImageMediaId);
  if (mediaIds.size > 0) {
    const found = await tx.media.count({ where: { id: { in: [...mediaIds] }, storeId } });
    if (found !== mediaIds.size) throw invalid('UNKNOWN_MEDIA', { field: 'media' });
  }

  const sameSlug = await tx.product.findFirst({
    where: { storeId, slug: input.slug, ...(productId ? { id: { not: productId } } : {}) },
    select: { id: true },
  });
  if (sameSlug) {
    throw new AppError('CONFLICT', 'Another product already uses this slug', {
      details: { field: 'slug' },
    });
  }
  const takenSkus = await tx.productVariant.findMany({
    where: {
      storeId,
      sku: { in: [...skus] },
      ...(productId ? { productId: { not: productId } } : {}),
    },
    select: { sku: true },
  });
  if (takenSkus.length > 0) {
    throw new AppError('CONFLICT', 'Another product already uses these SKUs', {
      details: { field: 'sku', skus: takenSkus.map((variant) => variant.sku) },
    });
  }
}

const variantData = (variant: VariantInput, position: number) => ({
  sku: variant.sku,
  options: variant.options,
  price: variant.price,
  compareAtPrice: variant.compareAtPrice,
  costPrice: variant.costPrice,
  weightGrams: variant.weightGrams,
  carrierProductRef: variant.carrierProductRef,
  isActive: variant.isActive,
  position,
});

/**
 * Replaces the variants of a product: kept ones are updated in place (their identifier survives
 * for orders and stock), new ones created, missing ones deleted. Returns SKU → variant id.
 */
async function writeVariants(
  tx: DbTransaction,
  product: { id: string; storeId: string },
  variants: readonly VariantInput[],
  existing: readonly { id: string; sku: string }[],
): Promise<Map<string, string>> {
  const kept = new Set(variants.flatMap((variant) => (variant.id ? [variant.id] : [])));
  const removed = existing.filter((variant) => !kept.has(variant.id)).map((variant) => variant.id);
  if (removed.length > 0) await tx.productVariant.deleteMany({ where: { id: { in: removed } } });
  // SKUs may be swapped between variants: free them first (unique per store).
  const renamed = variants.filter(
    (variant) => variant.id && existing.some((e) => e.id === variant.id && e.sku !== variant.sku),
  );
  for (const variant of renamed) {
    if (!variant.id) continue;
    await tx.productVariant.update({
      where: { id: variant.id },
      data: { sku: `ZZTMP-${variant.id.toUpperCase()}` },
    });
  }
  const ids = new Map<string, string>();
  for (const [position, variant] of variants.entries()) {
    if (variant.id) {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: variantData(variant, position),
      });
      ids.set(variant.sku, variant.id);
    } else {
      const id = crypto.randomUUID();
      await tx.productVariant.create({
        data: {
          id,
          productId: product.id,
          storeId: product.storeId,
          ...variantData(variant, position),
        },
      });
      ids.set(variant.sku, id);
    }
  }
  return ids;
}

async function writeMedia(
  tx: DbTransaction,
  productId: string,
  media: ProductInput['media'],
  variantIds: ReadonlyMap<string, string>,
) {
  await tx.productMedia.deleteMany({ where: { productId } });
  if (media.length === 0) return;
  await tx.productMedia.createMany({
    data: media.map((link, position) => ({
      productId,
      mediaId: link.mediaId,
      variantId: link.variantSku === null ? null : (variantIds.get(link.variantSku) ?? null),
      position,
    })),
  });
}

const productData = (input: ProductInput) => ({
  slug: input.slug,
  name: input.name,
  status: input.status,
  content: input.content,
  options: input.options,
  seo: input.seo,
});

/** Audit snapshot: identification and status only (texts and prices live in the product). */
const snapshot = (product: { slug: string; name: string; status: ProductStatus }) => ({
  slug: product.slug,
  name: product.name,
  status: product.status,
});

export async function createProduct(
  { db, storage }: ProductsDependencies,
  actor: Actor,
  storeId: string,
  input: ProductInput,
): Promise<ProductDto> {
  const product = await db.$transaction(async (tx) => {
    const locales = await storeLocales(tx, storeId);
    await assertConsistent(tx, storeId, input, undefined, new Set());
    assertPublishable(input.status, input.content.title, locales, input.variants);
    const created = await tx.product.create({ data: { storeId, ...productData(input) } });
    const variantIds = await writeVariants(tx, created, input.variants, []);
    await writeMedia(tx, created.id, input.media, variantIds);
    await recordAudit(tx, {
      actorType: 'USER',
      actorUserId: actor.userId,
      action: 'product.created',
      entityType: 'Product',
      entityId: created.id,
      storeId,
      after: snapshot(created),
    });
    return getProduct(tx, storeId, created.id);
  });
  return toProductDto(product, storage, actor);
}

export async function updateProduct(
  { db, storage }: ProductsDependencies,
  actor: Actor,
  storeId: string,
  productId: string,
  input: ProductInput & { expectedUpdatedAt: string },
): Promise<ProductDto> {
  const product = await db.$transaction(async (tx) => {
    const before = await getProduct(tx, storeId, productId);
    // Optimistic lock: the row is locked and only written if nobody saved in between.
    const { count } = await tx.product.updateMany({
      where: { id: productId, storeId, updatedAt: new Date(input.expectedUpdatedAt) },
      data: productData(input),
    });
    if (count === 0) {
      throw new AppError('CONFLICT', 'The product was changed by someone else', {
        details: { reason: 'STALE' },
      });
    }
    const locales = await storeLocales(tx, storeId);
    await assertConsistent(
      tx,
      storeId,
      input,
      productId,
      new Set(before.variants.map((variant) => variant.id)),
    );
    assertPublishable(input.status, input.content.title, locales, input.variants);
    const variantIds = await writeVariants(tx, before, input.variants, before.variants);
    await writeMedia(tx, productId, input.media, variantIds);
    await recordAudit(tx, {
      actorType: 'USER',
      actorUserId: actor.userId,
      action: 'product.updated',
      entityType: 'Product',
      entityId: productId,
      storeId,
      before: snapshot(before),
      after: snapshot(input),
    });
    return getProduct(tx, storeId, productId);
  });
  return toProductDto(product, storage, actor);
}

export async function setProductStatus(
  { db, storage }: ProductsDependencies,
  actor: Actor,
  storeId: string,
  productId: string,
  status: ProductStatus,
): Promise<ProductDto> {
  const product = await db.$transaction(async (tx) => {
    const before = await getProduct(tx, storeId, productId);
    assertPublishable(
      status,
      contentOf(before.content).title,
      await storeLocales(tx, storeId),
      before.variants,
    );
    if (before.status !== status) {
      await tx.product.update({ where: { id: productId }, data: { status } });
      await recordAudit(tx, {
        actorType: 'USER',
        actorUserId: actor.userId,
        action: 'product.status_changed',
        entityType: 'Product',
        entityId: productId,
        storeId,
        before: { status: before.status },
        after: { status },
      });
    }
    return getProduct(tx, storeId, productId);
  });
  return toProductDto(product, storage, actor);
}

const SLUG_MAX = 80;
const SKU_MAX = 64;
const NAME_MAX = 120;

/**
 * Copy of a product as a draft: texts, options, SEO, variants (new SKUs) and images. Quantity
 * offers and landing pages join the copy when they exist (P1-05, phase 10).
 */
export async function duplicateProduct(
  { db, storage }: ProductsDependencies,
  actor: Actor,
  storeId: string,
  productId: string,
): Promise<ProductDto> {
  const product = await db.$transaction(async (tx) => {
    const source = await getProduct(tx, storeId, productId);
    const slugs = await tx.product.findMany({
      where: { storeId, slug: { startsWith: source.slug.slice(0, SLUG_MAX - 10) } },
      select: { slug: true },
    });
    const slug = nextFreeValue(
      source.slug,
      new Set(slugs.map((p) => p.slug)),
      (n) => (n === 1 ? '-copie' : `-copie-${String(n)}`),
      SLUG_MAX,
    );
    const takenSkus = new Set(
      (await tx.productVariant.findMany({ where: { storeId }, select: { sku: true } })).map(
        (variant) => variant.sku,
      ),
    );
    const copy = await tx.product.create({
      data: {
        storeId,
        slug,
        name: `${source.name.slice(0, NAME_MAX - 8)} (copie)`,
        status: 'DRAFT',
        content: contentOf(source.content),
        options: optionsOf(source.options),
        seo: seoOf(source.seo),
      },
    });
    const variantIds = new Map<string, string>();
    for (const variant of source.variants) {
      const sku = nextFreeValue(variant.sku, takenSkus, (n) => `-C${String(n)}`, SKU_MAX);
      takenSkus.add(sku);
      const created = await tx.productVariant.create({
        data: {
          productId: copy.id,
          storeId,
          sku,
          options: variantOptionsOf(variant.options),
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          costPrice: variant.costPrice,
          weightGrams: variant.weightGrams,
          carrierProductRef: variant.carrierProductRef,
          isActive: variant.isActive,
          position: variant.position,
        },
      });
      variantIds.set(variant.id, created.id);
    }
    if (source.media.length > 0) {
      await tx.productMedia.createMany({
        data: source.media.map((link) => ({
          productId: copy.id,
          mediaId: link.mediaId,
          variantId: link.variantId === null ? null : (variantIds.get(link.variantId) ?? null),
          position: link.position,
        })),
      });
    }
    await recordAudit(tx, {
      actorType: 'USER',
      actorUserId: actor.userId,
      action: 'product.duplicated',
      entityType: 'Product',
      entityId: copy.id,
      storeId,
      after: snapshot(copy),
      meta: { sourceProductId: source.id },
    });
    return getProduct(tx, storeId, copy.id);
  });
  return toProductDto(product, storage, actor);
}

export async function listProducts(
  { db, storage }: ProductsDependencies,
  storeId: string,
  query: {
    status?: ProductStatus | 'ALL' | undefined;
    q?: string | undefined;
    cursor?: string | undefined;
    limit: number;
  },
): Promise<{ items: ProductSummary[]; nextCursor: string | null }> {
  const q = query.q;
  const rows = await db.product.findMany({
    where: {
      storeId,
      ...(query.status === undefined
        ? { status: { not: 'ARCHIVED' } }
        : query.status === 'ALL'
          ? {}
          : { status: query.status }),
      ...(q === undefined
        ? {}
        : {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q.toLowerCase() } },
              { variants: { some: { sku: { contains: q.toUpperCase() } } } },
            ],
          }),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
    include: {
      variants: { select: { price: true, isActive: true } },
      media: { orderBy: { position: 'asc' }, take: 1, include: { media: true } },
    },
  });
  const page = rows.slice(0, query.limit);
  return {
    items: page.map((product) => {
      const prices = product.variants.filter((v) => v.isActive).map((v) => v.price);
      const cover = product.media[0]?.media;
      const dto = cover ? toMediaDto(cover, storage) : undefined;
      const thumb = dto?.variants.find((v) => v.format === 'webp');
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        status: product.status,
        variantCount: product.variants.length,
        priceMin: prices.length > 0 ? Math.min(...prices) : null,
        priceMax: prices.length > 0 ? Math.max(...prices) : null,
        coverUrl: dto ? (thumb?.url ?? dto.url) : null,
        updatedAt: product.updatedAt.toISOString(),
      };
    }),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}
