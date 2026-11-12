import { apiErrorSchema, productListSchema, productSchema } from '@dz/contracts';
import type { ProductDto } from '@dz/contracts';
import { createTestDatabase } from '@dz/db/testing';
import type { TestDatabase } from '@dz/db/testing';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.ts';
import type { App } from '../../app.ts';
import { testDependencies } from '../../test/helpers.ts';
import { signedInAs } from '../../test/sessions.ts';

let testDb: TestDatabase;
let app: App;
let owner: Awaited<ReturnType<typeof signedInAs>>;
let agentA: Awaited<ReturnType<typeof signedInAs>>;
let storeA: string;
let storeB: string;
let imageA: string;
let imageB: string;

const media = (storeId: string, n: number) =>
  testDb.db.media.create({
    data: {
      storeId,
      storageKey: `media/${storeId}/${String(n)}/original.jpg`,
      mimeType: 'image/jpeg',
      width: 800,
      height: 800,
      bytes: 1000,
      status: 'READY',
    },
  });

beforeAll(async () => {
  testDb = await createTestDatabase();
  app = await buildApp(testDependencies({ db: testDb.db }));
  await app.ready();
  storeA = (await testDb.db.store.create({ data: { slug: 'a', name: 'A', orderPrefix: 'AA' } })).id;
  storeB = (await testDb.db.store.create({ data: { slug: 'b', name: 'B', orderPrefix: 'BB' } })).id;
  imageA = (await media(storeA, 1)).id;
  imageB = (await media(storeB, 2)).id;
  owner = await signedInAs(testDb.db, ['OWNER']);
  agentA = await signedInAs(testDb.db, ['CONFIRMATION_AGENT'], { storeIds: [storeA] });
});
afterAll(async () => {
  await app.close();
  await testDb.drop();
});

const url = (storeId: string, path = '') => `/v1/stores/${storeId}/products${path}`;
const errorOf = (res: LightMyRequestResponse) => apiErrorSchema.parse(res.json()).error;
const send = (
  method: 'POST' | 'PUT' | 'PATCH' | 'GET',
  path: string,
  payload?: object,
  headers: Record<string, string> = owner.headers,
) => app.inject({ method, url: path, headers, ...(payload ? { payload } : {}) });

const simple = (overrides: Record<string, unknown> = {}) => ({
  name: 'Crème hydratante',
  slug: 'creme-hydratante',
  content: {
    title: { ar: 'كريم مرطب', fr: 'Crème hydratante' },
    description: { fr: 'Pour peau sèche.' },
  },
  variants: [
    { sku: 'crm-50', price: 2500, compareAtPrice: 3500, costPrice: 900, weightGrams: 120 },
  ],
  ...overrides,
});

const color = {
  key: 'color',
  name: { ar: 'اللون', fr: 'Couleur' },
  values: [
    { key: 'black', label: { ar: 'أسود', fr: 'Noir' } },
    { key: 'white', label: { ar: 'أبيض', fr: 'Blanc' } },
  ],
};
const size = {
  key: 'size',
  name: { fr: 'Taille' },
  values: [
    { key: 'm', label: { fr: 'M' } },
    { key: 'l', label: { fr: 'L' } },
  ],
};
const tshirt = () => ({
  name: 'T-shirt',
  slug: 't-shirt',
  content: { title: { ar: 'قميص', fr: 'T-shirt' }, description: {} },
  options: [color, size],
  variants: [
    { sku: 'TS-B-M', options: { color: 'black', size: 'm' }, price: 1800, costPrice: 700 },
    { sku: 'TS-B-L', options: { color: 'black', size: 'l' }, price: 1800, costPrice: 700 },
    { sku: 'TS-W-M', options: { color: 'white', size: 'm' }, price: 1900, costPrice: 700 },
    {
      sku: 'TS-W-L',
      options: { color: 'white', size: 'l' },
      price: 1900,
      costPrice: 700,
      isActive: false,
    },
  ],
  media: [{ mediaId: imageA, variantSku: 'ts-w-m' }],
});

let cream: ProductDto;
let shirt: ProductDto;

describe('produits', () => {
  it('création simple : variante unique, SKU normalisé, brouillon, journalisée', async () => {
    const res = await send('POST', url(storeA), simple());
    expect(res.statusCode).toBe(201);
    cream = productSchema.parse(res.json());
    expect(cream).toMatchObject({ status: 'DRAFT', slug: 'creme-hydratante', options: [] });
    expect(cream.variants).toMatchObject([{ sku: 'CRM-50', costPrice: 900, compareAtPrice: 3500 }]);
    expect(
      await testDb.db.auditLog.count({ where: { action: 'product.created', entityId: cream.id } }),
    ).toBe(1);
  });

  it('options × valeurs : une variante par combinaison, image liée à une variante', async () => {
    const res = await send('POST', url(storeA), tshirt());
    expect(res.statusCode).toBe(201);
    shirt = productSchema.parse(res.json());
    expect(shirt.variants.map((v) => v.sku)).toEqual(['TS-B-M', 'TS-B-L', 'TS-W-M', 'TS-W-L']);
    const white = shirt.variants.find((v) => v.sku === 'TS-W-M');
    expect(shirt.media).toMatchObject([{ variantId: white?.id, position: 0 }]);
    expect(shirt.media[0]?.media.id).toBe(imageA);
  });

  it('refus : variantes incohérentes, prix barré, image d’une autre boutique, doublons', async () => {
    const twoNoOption = await send(
      'POST',
      url(storeA),
      simple({
        slug: 'x1',
        variants: [
          { sku: 'X1', price: 1, costPrice: 1 },
          { sku: 'X2', price: 1, costPrice: 1 },
        ],
      }),
    );
    expect(errorOf(twoNoOption)).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: {
        reason: 'INVALID_VARIANTS',
        issues: [
          { code: 'NO_OPTION_SINGLE_VARIANT', count: 2 },
          { code: 'DUPLICATE_COMBINATION', index: 1 },
        ],
      },
    });
    const compareAt = await send(
      'POST',
      url(storeA),
      simple({
        slug: 'x2',
        variants: [{ sku: 'X3', price: 2000, compareAtPrice: 2000, costPrice: 1 }],
      }),
    );
    expect(errorOf(compareAt).details).toMatchObject({
      issues: [{ code: 'COMPARE_AT_NOT_ABOVE_PRICE' }],
    });
    const foreignImage = await send(
      'POST',
      url(storeA),
      simple({
        slug: 'x3',
        variants: [{ sku: 'X4', price: 1, costPrice: 1 }],
        media: [{ mediaId: imageB }],
      }),
    );
    expect(errorOf(foreignImage).details).toMatchObject({ reason: 'UNKNOWN_MEDIA' });
    const slug = await send(
      'POST',
      url(storeA),
      simple({ variants: [{ sku: 'X5', price: 1, costPrice: 1 }] }),
    );
    expect([slug.statusCode, errorOf(slug).details]).toEqual([409, { field: 'slug' }]);
    const sku = await send('POST', url(storeA), simple({ slug: 'x4' }));
    expect([sku.statusCode, errorOf(sku).details]).toEqual([
      409,
      { field: 'sku', skus: ['CRM-50'] },
    ]);
    // Same slug and SKU are fine in another store.
    expect((await send('POST', url(storeB), simple())).statusCode).toBe(201);
    expect(await testDb.db.product.count({ where: { storeId: storeA } })).toBe(2);
  });

  it('publication : titre dans chaque langue de la boutique et prix non nul exigés', async () => {
    const missing = await send(
      'POST',
      url(storeA),
      simple({
        slug: 'sans-arabe',
        status: 'ACTIVE',
        content: { title: { fr: 'Sans arabe' }, description: {} },
        variants: [{ sku: 'SA-1', price: 0, costPrice: 0 }],
      }),
    );
    expect(errorOf(missing).details).toEqual({
      reason: 'NOT_PUBLISHABLE',
      problems: [
        { code: 'TITLE_MISSING', locale: 'ar' },
        { code: 'ZERO_PRICE', sku: 'SA-1' },
      ],
    });
    const published = await send('PATCH', url(storeA, `/${cream.id}/status`), { status: 'ACTIVE' });
    expect(productSchema.parse(published.json()).status).toBe('ACTIVE');
  });

  it('modification : identifiants conservés, SKU échangés, variante retirée, verrou optimiste', async () => {
    const [bm, bl, wm] = shirt.variants;
    const body = {
      ...tshirt(),
      options: [color, { ...size, values: [size.values[0], size.values[1]] }],
      variants: [
        // SKUs swapped between two existing variants, one removed, one new.
        {
          id: bm?.id,
          sku: 'TS-B-L',
          options: { color: 'black', size: 'm' },
          price: 1700,
          costPrice: 700,
        },
        {
          id: bl?.id,
          sku: 'TS-B-M',
          options: { color: 'black', size: 'l' },
          price: 1700,
          costPrice: 700,
        },
        {
          id: wm?.id,
          sku: 'TS-W-M',
          options: { color: 'white', size: 'm' },
          price: 1900,
          costPrice: 700,
        },
        { sku: 'TS-W-L2', options: { color: 'white', size: 'l' }, price: 1900, costPrice: 700 },
      ],
      expectedUpdatedAt: shirt.updatedAt,
    };
    const res = await send('PUT', url(storeA, `/${shirt.id}`), body);
    expect(res.statusCode).toBe(200);
    const updated = productSchema.parse(res.json());
    expect(updated.variants.map((v) => [v.id, v.sku])).toEqual([
      [bm?.id, 'TS-B-L'],
      [bl?.id, 'TS-B-M'],
      [wm?.id, 'TS-W-M'],
      [expect.any(String), 'TS-W-L2'],
    ]);
    expect(updated.media[0]?.variantId).toBe(wm?.id);
    const stale = await send('PUT', url(storeA, `/${shirt.id}`), body);
    expect([stale.statusCode, errorOf(stale).details]).toEqual([409, { reason: 'STALE' }]);
    const foreignVariant = await send('PUT', url(storeA, `/${cream.id}`), {
      ...simple(),
      variants: [{ id: bm?.id, sku: 'CRM-50', price: 2500, costPrice: 900 }],
      expectedUpdatedAt: (
        await testDb.db.product.findUniqueOrThrow({ where: { id: cream.id } })
      ).updatedAt.toISOString(),
    });
    expect(errorOf(foreignVariant).details).toMatchObject({ reason: 'UNKNOWN_VARIANT' });
    shirt = updated;
  });

  it('duplication : brouillon, slug et SKU libres, images rattachées aux nouvelles variantes', async () => {
    const first = productSchema.parse(
      (await send('POST', url(storeA, `/${shirt.id}/duplicate`))).json(),
    );
    expect(first).toMatchObject({
      status: 'DRAFT',
      slug: 't-shirt-copie',
      name: 'T-shirt (copie)',
    });
    expect(first.variants.map((v) => v.sku)).toEqual([
      'TS-B-L-C1',
      'TS-B-M-C1',
      'TS-W-M-C1',
      'TS-W-L2-C1',
    ]);
    const whiteCopy = first.variants.find((v) => v.sku === 'TS-W-M-C1');
    expect(first.media[0]?.variantId).toBe(whiteCopy?.id);
    const second = productSchema.parse(
      (await send('POST', url(storeA, `/${shirt.id}/duplicate`))).json(),
    );
    expect(second.slug).toBe('t-shirt-copie-2');
    expect(second.variants[0]?.sku).toBe('TS-B-L-C2');
  });

  it('liste : archivés masqués par défaut, recherche par SKU, fourchette de prix', async () => {
    await send('PATCH', url(storeA, `/${cream.id}/status`), { status: 'ARCHIVED' });
    const list = productListSchema.parse((await send('GET', url(storeA))).json());
    expect(list.items.map((p) => p.slug)).not.toContain('creme-hydratante');
    expect(list.items.find((p) => p.slug === 't-shirt')).toMatchObject({
      variantCount: 4,
      priceMin: 1700,
      priceMax: 1900,
    });
    const all = productListSchema.parse((await send('GET', url(storeA, '?status=ALL'))).json());
    expect(all.items).toHaveLength(4);
    const bySku = productListSchema.parse(
      (await send('GET', url(storeA, '?q=crm-50&status=ALL'))).json(),
    );
    expect(bySku.items.map((p) => p.slug)).toEqual(['creme-hydratante']);
    const page = productListSchema.parse(
      (await send('GET', url(storeA, '?status=ALL&limit=3'))).json(),
    );
    expect(page.items).toHaveLength(3);
    const rest = productListSchema.parse(
      (
        await send('GET', url(storeA, `?status=ALL&limit=3&cursor=${page.nextCursor ?? ''}`))
      ).json(),
    );
    expect(rest.items).toHaveLength(1);
  });

  it('droits : l’agent lit sans voir les coûts, ne modifie rien, ne voit pas les autres boutiques', async () => {
    const read = productSchema.parse(
      (await send('GET', url(storeA, `/${shirt.id}`), undefined, agentA.headers)).json(),
    );
    expect(read.variants.every((v) => v.costPrice === null)).toBe(true);
    expect(
      (await send('POST', url(storeA), simple({ slug: 'z' }), agentA.headers)).statusCode,
    ).toBe(403);
    expect((await send('GET', url(storeB), undefined, agentA.headers)).statusCode).toBe(404);
    expect((await send('GET', url(storeB, `/${shirt.id}`))).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: url(storeA) })).statusCode).toBe(401);
  });

  it('base : un prix barré inférieur au prix est refusé même hors API', async () => {
    const variant = await testDb.db.productVariant.findFirstOrThrow({ where: { storeId: storeA } });
    await expect(
      testDb.db.productVariant.update({ where: { id: variant.id }, data: { compareAtPrice: 1 } }),
    ).rejects.toThrow();
  });
});
