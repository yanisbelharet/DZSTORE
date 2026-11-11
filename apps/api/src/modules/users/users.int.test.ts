import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { apiErrorSchema } from '@dz/contracts';
import { createTestDatabase } from '@dz/db/testing';
import type { TestDatabase } from '@dz/db/testing';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.ts';
import type { App } from '../../app.ts';
import { CSRF, testDependencies } from '../../test/helpers.ts';
import { signedInAs } from '../../test/sessions.ts';
import { verifyPassword } from '../auth/password.ts';

let testDb: TestDatabase;
let app: App;
let owner: Awaited<ReturnType<typeof signedInAs>>;
let admin: Awaited<ReturnType<typeof signedInAs>>;
let storeA: string;
let storeB: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
  app = await buildApp(testDependencies({ db: testDb.db }));
  await app.ready();
  owner = await signedInAs(testDb.db, ['OWNER']);
  admin = await signedInAs(testDb.db, ['ADMIN']);
  storeA = (await testDb.db.store.create({ data: { slug: 'a', name: 'A', orderPrefix: 'A' } })).id;
  storeB = (await testDb.db.store.create({ data: { slug: 'b', name: 'B', orderPrefix: 'B' } })).id;
});
afterAll(async () => {
  await app.close();
  await testDb.drop();
});

const errorCode = (res: LightMyRequestResponse) => apiErrorSchema.parse(res.json()).error.code;
let sequence = 0;
const newAgent = (overrides: Record<string, unknown> = {}) => {
  sequence += 1;
  return {
    email: `Agent${String(sequence)}@DZ.test`,
    name: `Agent ${String(sequence)}`,
    roles: ['CONFIRMATION_AGENT'],
    password: 'correct horse battery',
    ...overrides,
  };
};
const create = (headers: Record<string, string>, payload: object) =>
  app.inject({ method: 'POST', url: '/v1/users', headers, payload });
const patch = (headers: Record<string, string>, id: string, payload: object) =>
  app.inject({ method: 'PATCH', url: `/v1/users/${id}`, headers, payload });
const login = (email: string, password: string) =>
  app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: CSRF,
    remoteAddress: `10.9.${String(++sequence)}.1`,
    payload: { email, password },
  });

describe('création de comptes', () => {
  it('OWNER crée un agent rattaché à des boutiques ; e-mail normalisé ; audit sans e-mail', async () => {
    const res = await create(owner.headers, newAgent({ storeIds: [storeA] }));
    expect(res.statusCode).toBe(201);
    const user = res.json<{
      id: string;
      email: string;
      storeIds: string[];
      totpEnabled: boolean;
    }>();
    expect(user.email).toMatch(/^agent\d+@dz\.test$/u);
    expect(user.storeIds).toEqual([storeA]);
    const audit = await testDb.db.auditLog.findFirstOrThrow({
      where: { action: 'user.created', entityId: user.id },
    });
    expect(audit.actorUserId).toBe(owner.user.id);
    expect(JSON.stringify(audit.after)).not.toContain(user.email);
    const stored = await testDb.db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(stored.passwordHash, 'correct horse battery')).toBe(true);
  });

  it('ADMIN crée des agents mais jamais d’ADMIN ni d’OWNER', async () => {
    expect((await create(admin.headers, newAgent())).statusCode).toBe(201);
    const promote = await create(admin.headers, newAgent({ roles: ['ADMIN'] }));
    expect(promote.statusCode).toBe(403);
    expect(errorCode(promote)).toBe('FORBIDDEN');
    expect((await create(admin.headers, newAgent({ roles: ['OWNER'] }))).statusCode).toBe(403);
    expect((await create(owner.headers, newAgent({ roles: ['ADMIN'] }))).statusCode).toBe(201);
  });

  it('refuse un e-mail déjà utilisé, un mot de passe faible, une boutique inconnue', async () => {
    const payload = newAgent();
    expect((await create(owner.headers, payload)).statusCode).toBe(201);
    const duplicate = await create(owner.headers, {
      ...payload,
      email: payload.email.toLowerCase(),
    });
    expect(duplicate.statusCode).toBe(409);
    expect((await create(owner.headers, newAgent({ password: 'short' }))).statusCode).toBe(422);
    const unknownStore = await create(
      owner.headers,
      newAgent({ storeIds: ['01900000-0000-7000-8000-000000000000'] }),
    );
    expect(unknownStore.statusCode).toBe(422);
  });
});

describe('modification de comptes', () => {
  it('désactiver un agent révoque ses sessions immédiatement', async () => {
    const agent = await signedInAs(testDb.db, ['CONFIRMATION_AGENT']);
    expect(
      (await app.inject({ method: 'GET', url: '/v1/auth/me', headers: agent.headers })).statusCode,
    ).toBe(200);
    const res = await patch(admin.headers, agent.user.id, { isActive: false });
    expect(res.statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/v1/auth/me', headers: agent.headers })).statusCode,
    ).toBe(401);
    const audit = await testDb.db.auditLog.findFirstOrThrow({
      where: { action: 'user.updated', entityId: agent.user.id },
    });
    expect(audit.before).toMatchObject({ isActive: true });
    expect(audit.after).toMatchObject({ isActive: false });
  });

  it('changer les rôles ou les boutiques révoque les sessions ; renommer non', async () => {
    const agent = await signedInAs(testDb.db, ['CONFIRMATION_AGENT']);
    expect((await patch(owner.headers, agent.user.id, { name: 'Nouveau nom' })).statusCode).toBe(
      200,
    );
    expect(
      (await app.inject({ method: 'GET', url: '/v1/auth/me', headers: agent.headers })).statusCode,
    ).toBe(200);
    expect(
      (await patch(owner.headers, agent.user.id, { storeIds: [storeB] })).json(),
    ).toMatchObject({
      storeIds: [storeB],
    });
    expect(
      (await app.inject({ method: 'GET', url: '/v1/auth/me', headers: agent.headers })).statusCode,
    ).toBe(401);
  });

  it('enregistrer le formulaire complet sans rien changer aux droits ne déconnecte pas (BUG-008)', async () => {
    const agent = await signedInAs(testDb.db, ['CONFIRMATION_AGENT']);
    await testDb.db.userStoreAccess.create({ data: { userId: agent.user.id, storeId: storeA } });
    const res = await patch(owner.headers, agent.user.id, {
      name: 'Nom corrigé',
      roles: ['CONFIRMATION_AGENT'],
      storeIds: [storeA],
      locale: 'fr',
      isActive: true,
    });
    expect(res.statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/v1/auth/me', headers: agent.headers })).statusCode,
    ).toBe(200);
  });

  it('son propre compte s’enregistre si les rôles envoyés sont inchangés', async () => {
    const res = await patch(owner.headers, owner.user.id, {
      name: 'Propriétaire',
      roles: ['OWNER'],
    });
    expect(res.statusCode).toBe(200);
  });

  it('deux OWNER qui se désactivent en même temps : il en reste toujours un actif', async () => {
    const first = await signedInAs(testDb.db, ['OWNER']);
    const second = await signedInAs(testDb.db, ['OWNER']);
    // Leave only these two owners active.
    await testDb.db.user.updateMany({
      where: { roles: { has: 'OWNER' }, id: { notIn: [first.user.id, second.user.id] } },
      data: { isActive: false },
    });
    const results = await Promise.all([
      patch(first.headers, second.user.id, { isActive: false }),
      patch(second.headers, first.user.id, { isActive: false }),
    ]);
    // One succeeds; the other is refused (409, or 401 if its session was revoked first).
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes[0]).toBe(200);
    expect([401, 409]).toContain(codes[1]);
    expect(await testDb.db.user.count({ where: { roles: { has: 'OWNER' }, isActive: true } })).toBe(
      1,
    );
    await testDb.db.user.updateMany({
      where: { roles: { has: 'OWNER' } },
      data: { isActive: true },
    });
  });

  it('ADMIN ne peut pas modifier un OWNER ni un autre ADMIN', async () => {
    const otherAdmin = await signedInAs(testDb.db, ['ADMIN']);
    expect((await patch(admin.headers, owner.user.id, { name: 'X Y' })).statusCode).toBe(403);
    expect((await patch(admin.headers, otherAdmin.user.id, { name: 'X Y' })).statusCode).toBe(403);
  });

  it('personne ne change ses propres rôles ni ne se désactive', async () => {
    expect((await patch(owner.headers, owner.user.id, { isActive: false })).statusCode).toBe(403);
    expect((await patch(owner.headers, owner.user.id, { roles: ['ADMIN'] })).statusCode).toBe(403);
    expect((await patch(owner.headers, owner.user.id, { name: 'Propriétaire' })).statusCode).toBe(
      200,
    );
  });

  it('utilisateur inconnu : 404', async () => {
    expect(
      (await patch(owner.headers, '01900000-0000-7000-8000-000000000000', { name: 'X Y' }))
        .statusCode,
    ).toBe(404);
  });
});

describe('réinitialisations', () => {
  it('mot de passe réinitialisé par un ADMIN : ancien refusé, nouveau accepté, sessions révoquées', async () => {
    const payload = newAgent();
    const { id } = (await create(owner.headers, payload)).json<{ id: string }>();
    const email = payload.email.toLowerCase();
    expect((await login(email, payload.password)).statusCode).toBe(200);
    const reset = await app.inject({
      method: 'POST',
      url: `/v1/users/${id}/reset-password`,
      headers: admin.headers,
      payload: { newPassword: 'brand new password' },
    });
    expect(reset.statusCode).toBe(204);
    expect((await login(email, payload.password)).statusCode).toBe(401);
    expect((await login(email, 'brand new password')).statusCode).toBe(200);
  });

  it('2FA réinitialisée par l’OWNER pour un ADMIN', async () => {
    const target = await signedInAs(testDb.db, ['ADMIN']);
    await testDb.db.user.update({
      where: { id: target.user.id },
      data: { totpEnabledAt: new Date(), recoveryCodes: ['x'] },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/v1/users/${target.user.id}/reset-2fa`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(204);
    const user = await testDb.db.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(user.totpEnabledAt).toBeNull();
    expect(user.recoveryCodes).toEqual([]);
    expect(
      (await app.inject({ method: 'GET', url: '/v1/auth/me', headers: target.headers })).statusCode,
    ).toBe(401);
  });
});

describe('lecture, périmètre et audit', () => {
  it('liste filtrable et paginée', async () => {
    const page = await app.inject({
      method: 'GET',
      url: '/v1/users?role=CONFIRMATION_AGENT&limit=2',
      headers: owner.headers,
    });
    const body = page.json<{ items: { roles: string[] }[]; nextCursor: string | null }>();
    expect(body.items).toHaveLength(2);
    expect(body.items.every((u) => u.roles.includes('CONFIRMATION_AGENT'))).toBe(true);
    expect(body.nextCursor).not.toBeNull();
    const next = await app.inject({
      method: 'GET',
      url: `/v1/users?role=CONFIRMATION_AGENT&limit=2&cursor=${String(body.nextCursor)}`,
      headers: owner.headers,
    });
    expect(next.statusCode).toBe(200);
  });

  it('un agent ne voit que ses boutiques ; OWNER voit tout', async () => {
    const agent = await signedInAs(testDb.db, ['FOLLOWUP_AGENT'], { storeIds: [storeB] });
    const mine = await app.inject({ method: 'GET', url: '/v1/stores', headers: agent.headers });
    expect(mine.json<{ items: { id: string }[] }>().items.map((s) => s.id)).toEqual([storeB]);
    const all = await app.inject({ method: 'GET', url: '/v1/stores', headers: owner.headers });
    expect(all.json<{ items: unknown[] }>().items.length).toBeGreaterThanOrEqual(2);
  });

  it('journal d’audit consultable par OWNER/ADMIN, filtrable, refusé aux agents', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/audit?action=user.&limit=5',
      headers: admin.headers,
    });
    expect(res.statusCode).toBe(200);
    const items = res.json<{ items: { action: string }[] }>().items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.action.startsWith('user.'))).toBe(true);
    const agent = await signedInAs(testDb.db, ['CONFIRMATION_AGENT']);
    expect(
      (await app.inject({ method: 'GET', url: '/v1/audit', headers: agent.headers })).statusCode,
    ).toBe(403);
  });
});

describe('script de création du premier OWNER', () => {
  const run = (args: string[], env: Record<string, string>) =>
    execFileSync(
      'node',
      [path.resolve(import.meta.dirname, '../../cli/create-owner.ts'), ...args],
      {
        env: { ...process.env, ...env },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );

  it('crée un OWNER (mot de passe fourni ou généré) et refuse un doublon', async () => {
    const out = run(['--email', 'Boss@DZ.test', '--name', 'Le Patron'], {
      DATABASE_URL: testDb.url,
      OWNER_PASSWORD: 'a very strong password',
    });
    expect(out).toContain('OWNER created: boss@dz.test');
    expect(out).not.toContain('a very strong password');
    const boss = await testDb.db.user.findUniqueOrThrow({ where: { email: 'boss@dz.test' } });
    expect(boss.roles).toEqual(['OWNER']);
    const generated = run(['--email', 'boss2@dz.test', '--name', 'Second'], {
      DATABASE_URL: testDb.url,
    });
    expect(generated).toMatch(/Temporary password \(shown once\): \S{24}/u);
    expect(() =>
      run(['--email', 'boss@dz.test', '--name', 'Doublon'], { DATABASE_URL: testDb.url }),
    ).toThrow();
  });
});
