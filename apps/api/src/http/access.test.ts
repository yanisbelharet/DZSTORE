import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.ts';
import type { App } from '../app.ts';
import { testDependencies } from '../test/helpers.ts';

let app: App | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('contrôle d’accès déclaratif', () => {
  it('une route /v1 sans règle d’accès empêche le démarrage', async () => {
    app = await buildApp(testDependencies());
    const server = app;
    expect(() => server.get('/v1/oubli', () => 'x')).toThrow(/declares no access rule/u);
  });

  it('les routes hors /v1 (santé, documentation) ne sont pas concernées', async () => {
    app = await buildApp(testDependencies());
    await app.ready();
    expect(app.routeAccess.some((route) => route.url === '/health')).toBe(false);
    expect(app.routeAccess.every((route) => route.url.startsWith('/v1/'))).toBe(true);
  });

  it('toutes les routes métier exigent une permission ou une session', async () => {
    app = await buildApp(testDependencies());
    await app.ready();
    const publicRoutes = app.routeAccess
      .filter((route) => route.access === 'public')
      .map((route) => `${route.method} ${route.url}`)
      .sort();
    // Every public route is listed here on purpose: adding one must be a conscious decision.
    expect(publicRoutes).toEqual([
      'GET /v1/openapi.json',
      'HEAD /v1/openapi.json',
      'POST /v1/auth/login',
      'POST /v1/auth/logout',
    ]);
  });
});
