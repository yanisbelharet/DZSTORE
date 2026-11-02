import { AppError } from '@dz/core/errors';
import { apiErrorSchema } from '@dz/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildApp } from './app.ts';
import type { App } from './app.ts';
import { CSRF, memoryLogger, testConfig, testDependencies } from './test/helpers.ts';

let app: App | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(
  overrides: Parameters<typeof testDependencies>[0] = {},
  register?: (a: App) => void,
) {
  app = await buildApp(testDependencies(overrides));
  register?.(app);
  await app.ready();
  return app;
}

describe('API — santé', () => {
  it('GET /health répond 200 sans dépendre de la base', async () => {
    const server = await start({ checkDatabase: () => Promise.reject(new Error('db down')) });
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready répond 200 quand la base répond', async () => {
    const server = await start();
    const res = await server.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready', checks: { database: 'ok' } });
  });

  it('GET /ready répond 503 sans détail technique quand la base est coupée', async () => {
    const server = await start({
      checkDatabase: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432')),
    });
    const res = await server.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'unavailable', checks: { database: 'error' } });
    expect(res.body).not.toContain('ECONNREFUSED');
  });

  it('GET /ready répond 503 si la base ne répond pas à temps', async () => {
    const server = await start({
      checkDatabase: () => new Promise(() => undefined),
      readyTimeoutMs: 50,
    });
    const res = await server.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
  });
});

describe('API — format des erreurs', () => {
  const echoRoute = (server: App) => {
    server.post(
      '/v1/test/echo',
      {
        config: { access: 'public' },
        schema: {
          body: z.object({ phone: z.string().regex(/^0[5-7]\d{8}$/u), qty: z.number().int() }),
        },
      },
      (request) => request.body,
    );
    server.get('/v1/test/conflict', { config: { access: 'public' } }, () => {
      throw new AppError('CONFLICT', 'Order version mismatch', { details: { expected: 3 } });
    });
    server.get('/v1/test/crash', { config: { access: 'public' } }, () => {
      throw new Error('SELECT * FROM "User" WHERE password = secret failed');
    });
  };

  it('404 au format standard avec identifiant de requête', async () => {
    const server = await start();
    const res = await server.inject({ method: 'GET', url: '/v1/nope' });
    expect(res.statusCode).toBe(404);
    const body = apiErrorSchema.parse(res.json());
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('422 liste les champs invalides sans renvoyer leurs valeurs', async () => {
    const server = await start({}, echoRoute);
    const res = await server.inject({
      method: 'POST',
      url: '/v1/test/echo',
      headers: CSRF,
      payload: { phone: '0999999999', qty: 1.5 },
    });
    expect(res.statusCode).toBe(422);
    const body = apiErrorSchema.parse(res.json());
    expect(body.error.code).toBe('VALIDATION_FAILED');
    const fields = (body.error.details?.issues as { path: string }[]).map((issue) => issue.path);
    expect(fields.sort()).toEqual(['phone', 'qty']);
    expect(res.body).not.toContain('0999999999');
  });

  it('AppError : code, statut et détails exposés pour une erreur 4xx', async () => {
    const server = await start({}, echoRoute);
    const res = await server.inject({ method: 'GET', url: '/v1/test/conflict' });
    expect(res.statusCode).toBe(409);
    expect(apiErrorSchema.parse(res.json()).error).toMatchObject({
      code: 'CONFLICT',
      message: 'Order version mismatch',
      details: { expected: 3 },
    });
  });

  it('500 générique : aucun détail interne exposé, erreur journalisée', async () => {
    const { logger, lines } = memoryLogger();
    const server = await start({ logger }, echoRoute);
    const res = await server.inject({ method: 'GET', url: '/v1/test/crash' });
    expect(res.statusCode).toBe(500);
    const body = apiErrorSchema.parse(res.json());
    expect(body.error).toMatchObject({ code: 'INTERNAL', message: 'Internal server error' });
    expect(res.body).not.toContain('password');
    expect(lines.some((line) => line.level === 50)).toBe(true);
  });

  it('413 si le corps dépasse la limite', async () => {
    const server = await start({ config: testConfig({ bodyLimitBytes: 64 }) }, echoRoute);
    const res = await server.inject({
      method: 'POST',
      url: '/v1/test/echo',
      headers: CSRF,
      payload: { phone: '0555123456', qty: 1, filler: 'x'.repeat(200) },
    });
    expect(res.statusCode).toBe(413);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('400 pour un JSON mal formé, 415 pour un type de contenu non pris en charge', async () => {
    const server = await start({}, echoRoute);
    const malformed = await server.inject({
      method: 'POST',
      url: '/v1/test/echo',
      headers: { ...CSRF, 'content-type': 'application/json' },
      payload: '{"phone":',
    });
    expect(malformed.statusCode).toBe(400);
    expect(apiErrorSchema.parse(malformed.json()).error.code).toBe('BAD_REQUEST');
    const xml = await server.inject({
      method: 'POST',
      url: '/v1/test/echo',
      headers: { ...CSRF, 'content-type': 'application/xml' },
      payload: '<a/>',
    });
    expect(xml.statusCode).toBe(415);
    expect(apiErrorSchema.parse(xml.json()).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

describe('API — sécurité', () => {
  it('pose les en-têtes de sécurité et interdit la mise en cache', async () => {
    const server = await start();
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'cross-origin-resource-policy': 'same-origin',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'cache-control': 'no-store',
    });
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('HSTS en production', async () => {
    const server = await start({
      config: testConfig({ nodeEnv: 'production', docsEnabled: false }),
    });
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
  });

  it('CORS fermé par défaut : aucune autorisation pour une origine tierce', async () => {
    const server = await start();
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('CORS : seules les origines de la liste sont autorisées', async () => {
    const server = await start({
      config: testConfig({ corsOrigins: ['https://admin.dz.example'] }),
    });
    const allowed = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://admin.dz.example' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://admin.dz.example');
    const refused = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(refused.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('API — traçabilité et logs', () => {
  it('génère un identifiant de requête UUIDv7, ou reprend un identifiant entrant valide', async () => {
    const server = await start();
    const generated = await server.inject({ method: 'GET', url: '/health' });
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/u);
    const propagated = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'edge-abc12345' },
    });
    expect(propagated.headers['x-request-id']).toBe('edge-abc12345');
    const injected = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'bad id\nwith newline' },
    });
    expect(injected.headers['x-request-id']).not.toContain('bad');
  });

  it('journal d’accès sans IP, sans query string ni donnée personnelle', async () => {
    const { logger, lines } = memoryLogger();
    const server = await start({ logger });
    await server.inject({
      method: 'GET',
      url: '/v1/nope?phone=0555123456&token=abc',
      remoteAddress: '41.200.10.5',
    });
    const access = lines.find((line) => line.msg === 'request completed');
    expect(access).toMatchObject({ method: 'GET', path: '/v1/nope', statusCode: 404 });
    const all = JSON.stringify(lines);
    for (const leaked of ['0555123456', 'token=abc', '41.200.10.5']) {
      expect(all).not.toContain(leaked);
    }
  });
});

describe('API — OpenAPI', () => {
  it('expose un document OpenAPI 3.1 hors production', async () => {
    const server = await start();
    const res = await server.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json<{
      openapi: string;
      info: { title: string };
      paths: Record<string, unknown>;
    }>();
    expect(doc.openapi).toMatch(/^3\.1/u);
    expect(doc.info.title).toBe('DZ Commerce OS API');
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/health', '/ready']));
  });

  it('ne publie pas la documentation en production', async () => {
    const server = await start({
      config: testConfig({ nodeEnv: 'production', docsEnabled: false }),
    });
    expect((await server.inject({ method: 'GET', url: '/v1/openapi.json' })).statusCode).toBe(404);
    expect((await server.inject({ method: 'GET', url: '/docs' })).statusCode).toBe(404);
  });
});
