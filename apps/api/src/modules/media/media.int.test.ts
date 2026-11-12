import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { apiErrorSchema, MEDIA_MAX_BYTES, mediaListSchema, mediaSchema } from '@dz/contracts';
import type { MediaDto } from '@dz/contracts';
import { systemClock } from '@dz/core';
import { createTestDatabase } from '@dz/db/testing';
import type { TestDatabase } from '@dz/db/testing';
import type { LightMyRequestResponse } from 'fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp, createDefaultJobEngine } from '../../app.ts';
import type { App } from '../../app.ts';
import type { JobEngine } from '../../jobs/engine.ts';
import { memoryLogger, testConfig, testDependencies } from '../../test/helpers.ts';
import { signedInAs } from '../../test/sessions.ts';
import { createLocalDiskStorage } from './storage.ts';

let testDb: TestDatabase;
let app: App;
let jobs: JobEngine;
let directory: string;
let storage: ReturnType<typeof createLocalDiskStorage>;
let owner: Awaited<ReturnType<typeof signedInAs>>;
let agentA: Awaited<ReturnType<typeof signedInAs>>;
let storeA: string;
let storeB: string;

const BASE_URL = 'http://media.test/media';

beforeAll(async () => {
  testDb = await createTestDatabase();
  directory = await mkdtemp(path.join(tmpdir(), 'dz-media-'));
  storage = createLocalDiskStorage({ directory, publicBaseUrl: BASE_URL });
  const { logger } = memoryLogger();
  jobs = createDefaultJobEngine({ db: testDb.db, clock: systemClock, logger, media: storage });
  app = await buildApp(
    testDependencies({
      db: testDb.db,
      config: testConfig({ media: { driver: 'local', directory, publicBaseUrl: BASE_URL } }),
      media: storage,
      jobs,
    }),
  );
  await app.ready();
  storeA = (await testDb.db.store.create({ data: { slug: 'a', name: 'A', orderPrefix: 'AA' } })).id;
  storeB = (await testDb.db.store.create({ data: { slug: 'b', name: 'B', orderPrefix: 'BB' } })).id;
  owner = await signedInAs(testDb.db, ['OWNER']);
  agentA = await signedInAs(testDb.db, ['CONFIRMATION_AGENT'], { storeIds: [storeA] });
});
afterAll(async () => {
  await app.close();
  await testDb.drop();
  await rm(directory, { recursive: true, force: true });
});

const errorCode = (res: LightMyRequestResponse) => apiErrorSchema.parse(res.json()).error.code;
const upload = (
  headers: Record<string, string>,
  storeId: string,
  body: Buffer,
  type = 'image/jpeg',
) =>
  app.inject({
    method: 'POST',
    url: `/v1/stores/${storeId}/media`,
    headers: { ...headers, 'content-type': type },
    payload: body,
  });
const keyOf = (url: string) => url.slice(BASE_URL.length + 1);

/** 1500×1000 photo taken « sideways » (EXIF orientation 6) with a GPS-like comment. */
const photo = () =>
  sharp({ create: { width: 1500, height: 1000, channels: 3, background: '#c0392b' } })
    .jpeg()
    .withMetadata({ orientation: 6, exif: { IFD0: { ImageDescription: 'GPS 36.75N 3.06E' } } })
    .toBuffer();

let uploaded: MediaDto;

describe('médias', () => {
  it('téléversement : image nettoyée (orientation appliquée, métadonnées supprimées), job créé', async () => {
    const res = await upload(owner.headers, storeA, await photo());
    expect(res.statusCode).toBe(201);
    uploaded = mediaSchema.parse(res.json());
    expect(uploaded).toMatchObject({ status: 'PROCESSING', mimeType: 'image/jpeg' });
    expect([uploaded.width, uploaded.height]).toEqual([1000, 1500]);
    expect(uploaded.url).toMatch(
      new RegExp(`^${BASE_URL}/media/${storeA}/${uploaded.id}/original\\.jpg$`, 'u'),
    );
    const stored = await sharp(storage.pathOf(keyOf(uploaded.url))).metadata();
    expect([stored.exif, stored.orientation]).toEqual([undefined, undefined]);
    expect(await testDb.db.job.count({ where: { queue: 'media.process' } })).toBe(1);
  });

  it('job : variantes AVIF et WebP jusqu’à la largeur de l’original, idempotent', async () => {
    const stats = await jobs.runTick();
    expect(stats.succeeded).toBeGreaterThanOrEqual(1);
    const list = mediaListSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/v1/stores/${storeA}/media`,
          headers: owner.headers,
        })
      ).json(),
    );
    const media = list.items.find((item) => item.id === uploaded.id);
    expect(media?.status).toBe('READY');
    expect(media?.variants.map((v) => `${v.format}-${String(v.width)}`)).toEqual([
      'avif-320',
      'webp-320',
      'avif-640',
      'webp-640',
      'avif-960',
      'webp-960',
    ]);
    for (const variant of media?.variants ?? []) {
      expect((await stat(storage.pathOf(keyOf(variant.url)))).size).toBeGreaterThan(0);
      expect(variant.height).toBe(Math.round(variant.width * 1.5));
    }
    const before = await testDb.db.media.findUniqueOrThrow({ where: { id: uploaded.id } });
    await jobs.enqueue(testDb.db, 'media.process', { mediaId: uploaded.id });
    await jobs.runTick();
    const after = await testDb.db.media.findUniqueOrThrow({ where: { id: uploaded.id } });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('fichiers servis en cache immuable ; chemin hors médias refusé', async () => {
    const media = await testDb.db.media.findUniqueOrThrow({ where: { id: uploaded.id } });
    const key = (media.variants as { key: string }[])[0]?.key ?? '';
    const file = await app.inject({ method: 'GET', url: `/media/${key}` });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/avif');
    expect(file.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    // Embedded by the storefront and the admin (other origins).
    expect(file.headers['cross-origin-resource-policy']).toBe('cross-origin');
    for (const url of [
      '/media/media/../../etc/passwd.png',
      '/media/media/x/y/nope.avif',
      '/media/secret.txt',
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
  });

  it('refus : faux fichier image, type non pris en charge, fichier trop lourd', async () => {
    const fake = await upload(
      owner.headers,
      storeA,
      Buffer.from('<svg onload=alert(1)>'),
      'image/png',
    );
    expect([fake.statusCode, errorCode(fake)]).toEqual([415, 'UNSUPPORTED_MEDIA_TYPE']);
    const svg = await upload(owner.headers, storeA, Buffer.from('<svg/>'), 'image/svg+xml');
    expect(svg.statusCode).toBe(415);
    const big = await upload(owner.headers, storeA, Buffer.alloc(MEDIA_MAX_BYTES + 1, 1));
    expect([big.statusCode, errorCode(big)]).toEqual([413, 'PAYLOAD_TOO_LARGE']);
    expect(await testDb.db.media.count()).toBe(1);
  });

  it('droits et périmètre : l’agent lit sa boutique, ne téléverse pas, ne voit pas les autres', async () => {
    const list = await app.inject({
      method: 'GET',
      url: `/v1/stores/${storeA}/media`,
      headers: agentA.headers,
    });
    expect(list.statusCode).toBe(200);
    const other = await app.inject({
      method: 'GET',
      url: `/v1/stores/${storeB}/media`,
      headers: agentA.headers,
    });
    expect(other.statusCode).toBe(404);
    expect((await upload(agentA.headers, storeA, await photo())).statusCode).toBe(403);
    const crossStore = await app.inject({
      method: 'PATCH',
      url: `/v1/stores/${storeB}/media/${uploaded.id}`,
      headers: owner.headers,
      payload: { alt: { fr: 'x' } },
    });
    expect(crossStore.statusCode).toBe(404);
  });

  it('texte alternatif puis suppression (ligne et fichiers)', async () => {
    const patched = await app.inject({
      method: 'PATCH',
      url: `/v1/stores/${storeA}/media/${uploaded.id}`,
      headers: owner.headers,
      payload: { alt: { ar: 'كريم', fr: 'Crème' } },
    });
    expect(mediaSchema.parse(patched.json()).alt).toEqual({ ar: 'كريم', fr: 'Crème' });
    const removed = await app.inject({
      method: 'DELETE',
      url: `/v1/stores/${storeA}/media/${uploaded.id}`,
      headers: owner.headers,
    });
    expect(removed.statusCode).toBe(204);
    await expect(stat(storage.pathOf(keyOf(uploaded.url)))).rejects.toThrow();
    expect(await testDb.db.media.count()).toBe(0);
    expect(
      await testDb.db.auditLog.count({ where: { entityType: 'Media', entityId: uploaded.id } }),
    ).toBe(3);
  });
});

describe('médias désactivés (Vercel sans R2)', () => {
  it('le téléversement répond 503 sans rien écrire', async () => {
    const disabled = await buildApp(testDependencies({ db: testDb.db, media: null }));
    await disabled.ready();
    const res = await disabled.inject({
      method: 'POST',
      url: `/v1/stores/${storeA}/media`,
      headers: { ...owner.headers, 'content-type': 'image/jpeg' },
      payload: await photo(),
    });
    expect([res.statusCode, errorCode(res)]).toEqual([503, 'UNAVAILABLE']);
    expect(await testDb.db.media.count()).toBe(0);
    await disabled.close();
  });
});
