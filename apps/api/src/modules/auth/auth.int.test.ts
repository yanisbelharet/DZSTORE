import { fixedClock } from '@dz/core';
import type { FixedClock } from '@dz/core';
import type { Role } from '@dz/db';
import { apiErrorSchema } from '@dz/contracts';
import { createTestDatabase } from '@dz/db/testing';
import type { TestDatabase } from '@dz/db/testing';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.ts';
import type { App } from '../../app.ts';
import { CSRF, memoryLogger, testDependencies } from '../../test/helpers.ts';
import { hashPassword } from './password.ts';
import { timeStep, totpCode } from './totp.ts';

const COOKIE = '__Host-dz_session';
const PASSWORD = 'correct horse battery';

let testDb: TestDatabase;
beforeAll(async () => {
  testDb = await createTestDatabase();
});
afterAll(async () => {
  await testDb.drop();
});

let app: App | undefined;
let clock: FixedClock;
let logLines: Record<string, unknown>[];
afterEach(async () => {
  await app?.close();
  app = undefined;
});

let sequence = 0;
/** Fresh app + clock per test; each test uses its own client IP (rate limits are per IP). */
async function setup() {
  sequence += 1;
  clock = fixedClock('2026-11-02T10:00:00Z');
  const { logger, lines } = memoryLogger();
  logLines = lines;
  app = await buildApp(testDependencies({ db: testDb.db, clock, logger }));
  await app.ready();
  return { server: app, ip: `10.0.${String(sequence)}.1` };
}

async function createUser(roles: Role[] = ['CONFIRMATION_AGENT']) {
  sequence += 1;
  return testDb.db.user.create({
    data: {
      email: `user${String(sequence)}@dz.test`,
      name: 'Utilisateur',
      passwordHash: await hashPassword(PASSWORD),
      roles,
    },
  });
}

function sessionCookie(res: LightMyRequestResponse): string {
  const cookie = res.cookies.find((c) => c.name === COOKIE);
  if (!cookie) throw new Error('no session cookie');
  return cookie.value;
}

const withCookie = (token: string) => ({ ...CSRF, cookie: `${COOKIE}=${token}` });

/** Error envelope of a response, validated against the shared contract. */
const errorOf = (res: LightMyRequestResponse) => apiErrorSchema.parse(res.json()).error;
const detailsOf = (res: LightMyRequestResponse) => errorOf(res).details ?? {};

function login(
  server: App,
  ip: string,
  body: { email: string; password?: string; remember?: boolean; client?: 'web' | 'mobile' },
) {
  return server.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: CSRF,
    remoteAddress: ip,
    payload: { password: PASSWORD, ...body },
  });
}

const get = (server: App, url: string, token: string) =>
  server.inject({ method: 'GET', url, headers: withCookie(token) });
const post = (server: App, url: string, token: string, payload?: object) =>
  server.inject({
    method: 'POST',
    url,
    headers: withCookie(token),
    ...(payload ? { payload } : {}),
  });

describe('connexion', () => {
  it('agent : session par cookie HttpOnly/Secure/SameSite=Lax, sans jeton dans la réponse', async () => {
    const { server, ip } = await setup();
    const user = await createUser();
    const res = await login(server, ip, { email: user.email.toUpperCase() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ twoFactor: 'not_required', user: { email: user.email } });
    expect(res.json()).not.toHaveProperty('token');
    const raw = String(res.headers['set-cookie']);
    expect(raw).toMatch(/HttpOnly/u);
    expect(raw).toMatch(/Secure/u);
    expect(raw).toMatch(/SameSite=Lax/u);
    expect(raw).toMatch(/Path=\//u);
    const me = await get(server, '/v1/auth/me', sessionCookie(res));
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { id: user.id, roles: ['CONFIRMATION_AGENT'] } });
    expect(me.json<{ permissions: string[] }>().permissions).toContain('orders.confirm');
    expect(me.json<{ permissions: string[] }>().permissions).not.toContain('users.manage');
  });

  it('mauvais mot de passe et compte inconnu : même réponse 401', async () => {
    const { server, ip } = await setup();
    const user = await createUser();
    const wrong = await login(server, ip, { email: user.email, password: 'wrong password!' });
    const unknown = await login(server, ip, { email: 'nobody@dz.test' });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(errorOf(wrong)).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(errorOf(unknown).message).toBe(errorOf(wrong).message);
  });

  it('verrouillage progressif après 5 échecs, levé après 15 minutes', async () => {
    const { server, ip } = await setup();
    const user = await createUser();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login(server, ip, { email: user.email, password: 'wrong password!' });
    }
    // Locked (and the per-account limit of 5 / 15 min is reached): refused either way.
    expect((await login(server, ip, { email: user.email })).statusCode).not.toBe(200);
    expect(
      (await testDb.db.user.findUniqueOrThrow({ where: { id: user.id } })).lockedUntil,
    ).not.toBeNull();
    clock.advance(16 * 60_000);
    expect((await login(server, ip, { email: user.email })).statusCode).toBe(200);
    const actions = await testDb.db.auditLog.findMany({ where: { entityId: user.id } });
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['auth.login.failed', 'auth.account.locked', 'auth.login.succeeded']),
    );
  });

  it('échecs concurrents tous comptés (pas de perte par lecture-écriture)', async () => {
    const { server } = await setup();
    const user = await createUser();
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        login(server, `10.77.${String(i)}.1`, { email: user.email, password: 'wrong password!' }),
      ),
    );
    const row = await testDb.db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.failedLoginCount).toBe(5);
    expect(row.lockedUntil).not.toBeNull();
  });

  it('un compte protégé par 2FA n’est jamais verrouillé par des échecs de mot de passe', async () => {
    const { server } = await setup();
    const user = await createUser();
    await testDb.db.user.update({ where: { id: user.id }, data: { totpEnabledAt: clock.now() } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login(server, `10.78.${String(attempt)}.1`, {
        email: user.email,
        password: 'wrong password!',
      });
    }
    expect(
      (await testDb.db.user.findUniqueOrThrow({ where: { id: user.id } })).lockedUntil,
    ).toBeNull();
  });

  it('limitation de débit par IP : 429 au-delà de 20 tentatives / 15 min', async () => {
    const { server, ip } = await setup();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await login(server, ip, { email: `x${String(attempt)}@dz.test` });
    }
    const limited = await login(server, ip, { email: 'y@dz.test' });
    expect(limited.statusCode).toBe(429);
    expect(errorOf(limited)).toMatchObject({ code: 'RATE_LIMITED' });
    expect(detailsOf(limited).retryAfterSeconds).toEqual(expect.any(Number));
  });

  it('CSRF : requête par cookie sans en-tête anti-CSRF refusée', async () => {
    const { server, ip } = await setup();
    const user = await createUser();
    const noHeader = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      remoteAddress: ip,
      payload: { email: user.email, password: PASSWORD },
    });
    expect(noHeader.statusCode).toBe(403);
    expect(errorOf(noHeader).code).toBe('CSRF_FAILED');
    const token = sessionCookie(await login(server, ip, { email: user.email }));
    const logout = await server.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie: `${COOKIE}=${token}` },
    });
    expect(logout.statusCode).toBe(403);
  });

  it('un chemin encodé (/%761/…) atteint la route /v1 : l’en-tête reste exigé (BUG-003)', async () => {
    const { server, ip } = await setup();
    const user = await createUser(['CONFIRMATION_AGENT']);
    const token = sessionCookie(await login(server, ip, { email: user.email }));
    const encoded = await server.inject({
      method: 'POST',
      url: '/%761/auth/logout-all',
      headers: { cookie: `${COOKIE}=${token}` },
    });
    expect(encoded.statusCode).toBe(403);
    expect(errorOf(encoded).code).toBe('CSRF_FAILED');
    expect((await get(server, '/v1/auth/me', token)).statusCode).toBe(200);
  });
});

describe('sessions', () => {
  it('déconnexion : la session est révoquée', async () => {
    const { server, ip } = await setup();
    const user = await createUser();
    const token = sessionCookie(await login(server, ip, { email: user.email }));
    const logout = await post(server, '/v1/auth/logout', token);
    expect(logout.statusCode).toBe(204);
    // A `__Host-` cookie is only cleared by the browser with the same attributes (Secure…).
    const cleared = String(logout.headers['set-cookie']);
    expect(cleared).toMatch(/__Host-dz_session=;/u);
    expect(cleared).toMatch(/Secure/u);
    expect(cleared).toMatch(/HttpOnly/u);
    expect(cleared).toMatch(/SameSite=Lax/u);
    expect((await get(server, '/v1/auth/me', token)).statusCode).toBe(401);
  });

  it('déconnecter partout révoque toutes les sessions', async () => {
    const { server, ip } = await setup();
    const user = await createUser();
    const first = sessionCookie(await login(server, ip, { email: user.email }));
    const second = sessionCookie(await login(server, ip, { email: user.email }));
    expect((await post(server, '/v1/auth/logout-all', first)).statusCode).toBe(204);
    expect((await get(server, '/v1/auth/me', second)).statusCode).toBe(401);
  });

  it('expiration après 12 h d’inactivité ; « se souvenir » (7 jours) réservé à l’OWNER', async () => {
    const { server, ip } = await setup();
    const agent = await createUser();
    const owner = await createUser(['OWNER']);
    const normal = sessionCookie(await login(server, ip, { email: agent.email }));
    const agentRemembered = sessionCookie(
      await login(server, ip, { email: agent.email, remember: true }),
    );
    const ownerRemembered = sessionCookie(
      await login(server, ip, { email: owner.email, remember: true }),
    );
    clock.advance(12 * 3_600_000 + 60_000);
    expect((await get(server, '/v1/auth/me', normal)).statusCode).toBe(401);
    expect((await get(server, '/v1/auth/me', agentRemembered)).statusCode).toBe(401);
    expect((await get(server, '/v1/auth/me', ownerRemembered)).statusCode).toBe(200);
  });

  it('l’activité fait glisser l’expiration, dans la limite absolue de 30 jours', async () => {
    const { server, ip } = await setup();
    const user = await createUser();
    const token = sessionCookie(await login(server, ip, { email: user.email }));
    for (let day = 0; day < 29; day += 1) {
      clock.advance(11 * 3_600_000);
      expect((await get(server, '/v1/auth/me', token)).statusCode).toBe(200);
      clock.advance(13 * 3_600_000 - 11 * 3_600_000);
      expect((await get(server, '/v1/auth/me', token)).statusCode).toBe(200);
    }
    clock.advance(2 * 24 * 3_600_000);
    expect((await get(server, '/v1/auth/me', token)).statusCode).toBe(401);
  });

  it('liste des sessions actives avec IP tronquée', async () => {
    const { server, ip } = await setup();
    const user = await createUser();
    const token = sessionCookie(await login(server, ip, { email: user.email }));
    const res = await get(server, '/v1/auth/sessions', token);
    expect(res.statusCode).toBe(200);
    const [current] = res.json<{ sessions: object[] }>().sessions;
    expect(current).toMatchObject({ current: true, ipPrefix: ip.replace(/\.1$/u, '.0/24') });
  });

  it('application mobile : jeton Bearer, sans cookie ni en-tête CSRF', async () => {
    const { server, ip } = await setup();
    const user = await createUser();
    const res = await login(server, ip, { email: user.email, client: 'mobile' });
    expect(res.cookies).toHaveLength(0);
    const { token } = res.json<{ token: string }>();
    const auth = { authorization: `Bearer ${token}` };
    expect(
      (await server.inject({ method: 'GET', url: '/v1/auth/me', headers: auth })).statusCode,
    ).toBe(200);
    // A mobile token is not accepted as a cookie (channel binding).
    expect((await get(server, '/v1/auth/me', token)).statusCode).toBe(401);
    const logout = await server.inject({ method: 'POST', url: '/v1/auth/logout', headers: auth });
    expect(logout.statusCode).toBe(204);
    expect(
      (await server.inject({ method: 'GET', url: '/v1/auth/me', headers: auth })).statusCode,
    ).toBe(401);
  });
});

describe('double authentification (TOTP)', () => {
  async function enrolledAdmin(server: App, ip: string) {
    const admin = await createUser(['ADMIN']);
    const token = sessionCookie(await login(server, ip, { email: admin.email }));
    const { secret } = (await post(server, '/v1/auth/2fa/setup', token)).json<{ secret: string }>();
    const enable = await post(server, '/v1/auth/2fa/enable', token, {
      code: totpCode(secret, timeStep(clock.now())),
    });
    return {
      admin,
      token,
      secret,
      recoveryCodes: enable.json<{ recoveryCodes: string[] }>().recoveryCodes,
    };
  }

  it('20 codes faux consécutifs : compte verrouillé, sessions révoquées, alerte d’audit', async () => {
    const { server, ip } = await setup();
    const { admin } = await enrolledAdmin(server, ip);
    let token = sessionCookie(await login(server, ip, { email: admin.email }));
    for (let failure = 1; failure <= 20; failure += 1) {
      if (failure % 5 === 0) clock.advance(16 * 60_000); // stay under the rate limits
      const res = await post(server, '/v1/auth/2fa/verify', token, { code: '000000' });
      expect(res.statusCode).toBe(401);
      if (failure % 4 === 0 && failure < 20) {
        token = sessionCookie(
          await login(server, `10.79.${String(failure)}.1`, { email: admin.email }),
        );
      }
    }
    const row = await testDb.db.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(row.lockedUntil).not.toBeNull();
    expect(row.failedTwoFactorCount).toBe(0);
    expect((await get(server, '/v1/auth/me', token)).statusCode).toBe(401);
    expect((await login(server, '10.79.99.1', { email: admin.email })).statusCode).toBe(401);
    const alert = await testDb.db.auditLog.count({
      where: { entityId: admin.id, action: 'auth.2fa.locked' },
    });
    expect(alert).toBe(1);
  });

  it('ADMIN : enrôlement obligatoire avant tout accès, puis codes de secours', async () => {
    const { server, ip } = await setup();
    const admin = await createUser(['ADMIN']);
    const res = await login(server, ip, { email: admin.email });
    expect(res.json<{ twoFactor: string }>().twoFactor).toBe('enrolment_required');
    const token = sessionCookie(res);
    const blocked = await get(server, '/v1/auth/sessions', token);
    expect(blocked.statusCode).toBe(403);
    expect(errorOf(blocked).code).toBe('TWO_FACTOR_ENROLMENT_REQUIRED');
    const me = await get(server, '/v1/auth/me', token);
    expect(me.json<{ twoFactor: string }>().twoFactor).toBe('enrolment_required');

    const setup2fa = await post(server, '/v1/auth/2fa/setup', token);
    const { secret, otpauthUrl } = setup2fa.json<{ secret: string; otpauthUrl: string }>();
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//u);
    const { totpSecretId } = await testDb.db.user.findUniqueOrThrow({ where: { id: admin.id } });
    const stored = await testDb.db.secret.findUniqueOrThrow({ where: { id: totpSecretId ?? '' } });
    expect(stored.kind).toBe('TOTP_SECRET');
    expect(Buffer.from(stored.ciphertext).toString('utf8')).not.toContain(secret);

    const wrong = await post(server, '/v1/auth/2fa/enable', token, { code: '000000' });
    expect(wrong.statusCode).toBe(401);
    const enable = await post(server, '/v1/auth/2fa/enable', token, {
      code: totpCode(secret, timeStep(clock.now())),
    });
    expect(enable.statusCode).toBe(200);
    expect(enable.json<{ recoveryCodes: string[] }>().recoveryCodes).toHaveLength(10);
    expect((await get(server, '/v1/auth/sessions', token)).statusCode).toBe(200);
    expect((await post(server, '/v1/auth/2fa/setup', token)).statusCode).toBe(409);
  });

  it('nouvelle connexion : vérification requise ; un code ne sert qu’une fois', async () => {
    const { server, ip } = await setup();
    const { admin, secret } = await enrolledAdmin(server, ip);
    const token = sessionCookie(await login(server, ip, { email: admin.email }));
    expect(errorOf(await get(server, '/v1/auth/sessions', token)).code).toBe('TWO_FACTOR_REQUIRED');
    // Same time step as the enrolment code: replay refused.
    const replay = await post(server, '/v1/auth/2fa/verify', token, {
      code: totpCode(secret, timeStep(clock.now())),
    });
    expect(replay.statusCode).toBe(401);
    clock.advance(30_000);
    const code = totpCode(secret, timeStep(clock.now()));
    expect((await post(server, '/v1/auth/2fa/verify', token, { code })).statusCode).toBe(204);
    expect((await get(server, '/v1/auth/sessions', token)).statusCode).toBe(200);
    const other = sessionCookie(await login(server, ip, { email: admin.email }));
    expect((await post(server, '/v1/auth/2fa/verify', other, { code })).statusCode).toBe(401);
  });

  it('code de secours à usage unique', async () => {
    const { server, ip } = await setup();
    const { admin, recoveryCodes } = await enrolledAdmin(server, ip);
    const [recoveryCode] = recoveryCodes;
    const first = sessionCookie(await login(server, ip, { email: admin.email }));
    expect((await post(server, '/v1/auth/2fa/verify', first, { recoveryCode })).statusCode).toBe(
      204,
    );
    const second = sessionCookie(await login(server, ip, { email: admin.email }));
    expect((await post(server, '/v1/auth/2fa/verify', second, { recoveryCode })).statusCode).toBe(
      401,
    );
  });

  it('5 codes faux par session puis 429', async () => {
    const { server, ip } = await setup();
    const { admin } = await enrolledAdmin(server, ip);
    const token = sessionCookie(await login(server, ip, { email: admin.email }));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        (await post(server, '/v1/auth/2fa/verify', token, { code: '000000' })).statusCode,
      ).toBe(401);
    }
    expect((await post(server, '/v1/auth/2fa/verify', token, { code: '000000' })).statusCode).toBe(
      429,
    );
  });
});

describe('mot de passe', () => {
  it('changement : politique appliquée, autres sessions révoquées', async () => {
    const { server, ip } = await setup();
    const user = await createUser();
    const token = sessionCookie(await login(server, ip, { email: user.email }));
    const other = sessionCookie(await login(server, ip, { email: user.email }));
    const wrongCurrent = await post(server, '/v1/auth/password', token, {
      currentPassword: 'nope nope nope',
      newPassword: 'new correct horse',
    });
    expect(wrongCurrent.statusCode).toBe(401);
    const weak = await post(server, '/v1/auth/password', token, {
      currentPassword: PASSWORD,
      newPassword: 'short',
    });
    expect(weak.statusCode).toBe(422);
    expect(detailsOf(weak).violations).toContain('TOO_SHORT');
    const ok = await post(server, '/v1/auth/password', token, {
      currentPassword: PASSWORD,
      newPassword: 'new correct horse',
    });
    expect(ok.statusCode).toBe(204);
    expect((await get(server, '/v1/auth/me', token)).statusCode).toBe(200);
    expect((await get(server, '/v1/auth/me', other)).statusCode).toBe(401);
    expect((await login(server, ip, { email: user.email })).statusCode).toBe(401);
    expect(
      (await login(server, ip, { email: user.email, password: 'new correct horse' })).statusCode,
    ).toBe(200);
  });

  it('vérification du mot de passe actuel limitée (pas d’oracle pour une session volée)', async () => {
    const { server, ip } = await setup();
    const user = await createUser();
    const token = sessionCookie(await login(server, ip, { email: user.email }));
    const attempt = () =>
      post(server, '/v1/auth/password', token, {
        currentPassword: 'guess guess guess',
        newPassword: 'new correct horse',
      });
    for (let i = 0; i < 5; i += 1) expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(429);
  });
});

describe('confidentialité', () => {
  it('ni mot de passe, ni jeton, ni e-mail dans les logs ; jeton haché en base', async () => {
    const { server, ip } = await setup();
    const user = await createUser();
    const res = await login(server, ip, { email: user.email });
    const token = sessionCookie(res);
    await login(server, ip, { email: user.email, password: 'wrong password!' });
    const logs = JSON.stringify(logLines);
    for (const leaked of [PASSWORD, 'wrong password!', token, user.email]) {
      expect(logs).not.toContain(leaked);
    }
    const sessions = await testDb.db.session.findMany({ where: { userId: user.id } });
    expect(sessions.every((s) => s.tokenHash !== token && s.tokenHash.length === 64)).toBe(true);
    const audits = JSON.stringify(
      (await testDb.db.auditLog.findMany({ where: { entityId: user.id } })).map((entry) => ({
        action: entry.action,
        meta: entry.meta,
      })),
    );
    expect(audits).not.toContain(user.email);
  });
});
