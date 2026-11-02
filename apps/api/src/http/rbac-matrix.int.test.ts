import { newId } from '@dz/core/ids';
import { Role as PrismaRole } from '@dz/db';
import { createTestDatabase } from '@dz/db/testing';
import type { TestDatabase } from '@dz/db/testing';
import { can, ROLES } from '@dz/domain';
import type { Role } from '@dz/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.ts';
import type { App } from '../app.ts';
import { testDependencies } from '../test/helpers.ts';
import { signedInAs } from '../test/sessions.ts';

let testDb: TestDatabase;
let app: App;
const sessions = new Map<string, Record<string, string>>();
const PROFILES: Role[][] = [
  ['OWNER'],
  ['ADMIN'],
  ['CONFIRMATION_AGENT'],
  ['FOLLOWUP_AGENT'],
  ['CONFIRMATION_AGENT', 'FOLLOWUP_AGENT'],
];

beforeAll(async () => {
  testDb = await createTestDatabase();
  app = await buildApp(testDependencies({ db: testDb.db }));
  await app.ready();
  for (const roles of PROFILES) {
    sessions.set(roles.join('+'), (await signedInAs(testDb.db, roles)).headers);
  }
});
afterAll(async () => {
  await app.close();
  await testDb.drop();
});

const concreteUrl = (url: string) => url.replace(/:[a-zA-Z]+/gu, newId());
const bodyFor = (method: string) => (['POST', 'PATCH', 'PUT'].includes(method) ? {} : undefined);

describe('matrice RBAC : chaque route × chaque rôle', () => {
  it('les rôles de la base et du domaine sont identiques', () => {
    expect(Object.values(PrismaRole).sort()).toEqual([...ROLES].sort());
  });

  it('chaque route soumise à permission respecte la matrice du domaine', async () => {
    const protectedRoutes = app.routeAccess.filter(
      (route): route is typeof route & { access: { permission: never } } =>
        typeof route.access === 'object',
    );
    expect(protectedRoutes.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const route of protectedRoutes) {
      const permission = (route.access as { permission: Parameters<typeof can>[1] }).permission;
      const url = concreteUrl(route.url);
      const payload = bodyFor(route.method);
      const anonymous = await app.inject({
        method: route.method as 'GET',
        url,
        headers: { 'x-dz-csrf': '1' },
        ...(payload ? { payload } : {}),
      });
      if (anonymous.statusCode !== 401)
        failures.push(`${route.method} ${route.url} anonyme → ${String(anonymous.statusCode)}`);
      for (const roles of PROFILES) {
        const res = await app.inject({
          method: route.method as 'GET',
          url,
          headers: sessions.get(roles.join('+')) ?? {},
          ...(payload ? { payload } : {}),
        });
        const allowed = can(roles, permission);
        const ok = allowed ? ![401, 403].includes(res.statusCode) : res.statusCode === 403;
        if (!ok) {
          failures.push(
            `${route.method} ${route.url} [${roles.join('+')}] → ${String(res.statusCode)} (autorisé : ${String(allowed)})`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('les routes « authentifiées » refusent les anonymes', async () => {
    const authenticated = app.routeAccess.filter((route) => route.access === 'authenticated');
    for (const route of authenticated) {
      const payload = bodyFor(route.method);
      const res = await app.inject({
        method: route.method as 'GET',
        url: concreteUrl(route.url),
        headers: { 'x-dz-csrf': '1' },
        ...(payload ? { payload } : {}),
      });
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(401);
    }
  });
});
