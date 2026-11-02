import type {} from '@fastify/cookie';
import { PERMISSIONS, permissionsOf } from '@dz/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireAuth } from './context.ts';
import type { AuthContext, TwoFactorState } from './context.ts';
import { sessionCookieName } from './plugin.ts';
import { changePassword, enableTotp, login, setupTotp, verifySecondFactor } from './service.ts';
import type { AuthDependencies } from './service.ts';
import { revokeSession, revokeUserSessions } from './sessions.ts';

export interface AuthRoutesOptions {
  deps: AuthDependencies;
  cookieSecure: boolean;
}

const email = z.string().trim().toLowerCase().pipe(z.email());
const totpCode = z.string().regex(/^\d{6}$/u);

const userDto = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  roles: z.array(z.string()),
  locale: z.string(),
});
const twoFactorDto = z.enum([
  'verified',
  'not_required',
  'verification_required',
  'enrolment_required',
]);
const meDto = z.object({
  user: userDto,
  twoFactor: twoFactorDto,
  totpEnabled: z.boolean(),
  /** Granted permissions: the admin UI shows or hides features with them (the API enforces). */
  permissions: z.array(z.enum(PERMISSIONS)),
  storeIds: z.union([z.literal('all'), z.array(z.string())]),
});

function me(auth: AuthContext) {
  return {
    user: {
      id: auth.userId,
      email: auth.email,
      name: auth.name,
      roles: auth.roles,
      locale: auth.locale,
    },
    twoFactor: auth.twoFactor,
    totpEnabled: auth.totpEnabled,
    permissions: permissionsOf(auth.roles),
    storeIds: auth.storeIds,
  };
}

/** /v1/auth/* — login, session, second factor, password (ADR-0007). */
export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = (
  app,
  { deps, cookieSecure },
) => {
  const cookieName = sessionCookieName(cookieSecure);
  const requestInfo = (request: {
    ip: string;
    headers: { 'user-agent'?: string | undefined };
  }) => ({
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  });

  app.post(
    '/login',
    {
      config: { access: 'public' },
      schema: {
        tags: ['auth'],
        body: z.object({
          email,
          password: z.string().min(1).max(256),
          remember: z.boolean().default(false),
          client: z.enum(['web', 'mobile']).default('web'),
        }),
        response: {
          200: z.object({
            user: userDto,
            twoFactor: twoFactorDto,
            expiresAt: z.iso.datetime(),
            token: z.string().optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { email: address, password, remember, client } = request.body;
      const { token, session, user } = await login(deps, {
        email: address,
        password,
        remember,
        kind: client === 'mobile' ? 'MOBILE' : 'WEB',
        ...requestInfo(request),
      });
      const twoFactor: TwoFactorState = session.twoFactorVerified
        ? 'not_required'
        : user.totpEnabledAt
          ? 'verification_required'
          : 'enrolment_required';
      if (client === 'web') {
        reply.setCookie(cookieName, token, {
          path: '/',
          httpOnly: true,
          secure: cookieSecure,
          sameSite: 'lax',
          expires: session.absoluteExpiresAt,
        });
      }
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          locale: user.locale,
        },
        twoFactor,
        expiresAt: session.expiresAt.toISOString(),
        ...(client === 'mobile' ? { token } : {}),
      };
    },
  );

  app.post(
    '/logout',
    { config: { access: 'public' }, schema: { tags: ['auth'] } },
    async (request, reply) => {
      if (request.auth) await revokeSession(deps.db, deps.clock, request.auth.sessionId);
      reply.clearCookie(cookieName, { path: '/' });
      return reply.status(204).send();
    },
  );

  app.post(
    '/logout-all',
    { config: { access: 'authenticated' }, schema: { tags: ['auth'] } },
    async (request, reply) => {
      const auth = requireAuth(request);
      await revokeUserSessions(deps.db, deps.clock, auth.userId);
      reply.clearCookie(cookieName, { path: '/' });
      return reply.status(204).send();
    },
  );

  app.get(
    '/me',
    {
      config: { access: 'authenticated', allowPendingTwoFactor: true },
      schema: { tags: ['auth'], response: { 200: meDto } },
    },
    (request) => me(requireAuth(request, { allowPendingTwoFactor: true })),
  );

  app.get(
    '/sessions',
    {
      config: { access: 'authenticated' },
      schema: {
        tags: ['auth'],
        response: {
          200: z.object({
            sessions: z.array(
              z.object({
                id: z.string(),
                kind: z.string(),
                ipPrefix: z.string().nullable(),
                userAgent: z.string().nullable(),
                createdAt: z.iso.datetime(),
                lastSeenAt: z.iso.datetime(),
                current: z.boolean(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      const sessions = await deps.db.session.findMany({
        where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: deps.clock.now() } },
        orderBy: { lastSeenAt: 'desc' },
      });
      return {
        sessions: sessions.map((session) => ({
          id: session.id,
          kind: session.kind,
          ipPrefix: session.ipPrefix,
          userAgent: session.userAgent,
          createdAt: session.createdAt.toISOString(),
          lastSeenAt: session.lastSeenAt.toISOString(),
          current: session.id === auth.sessionId,
        })),
      };
    },
  );

  app.post(
    '/2fa/setup',
    {
      config: { access: 'authenticated', allowPendingTwoFactor: true },
      schema: {
        tags: ['auth'],
        response: { 200: z.object({ secret: z.string(), otpauthUrl: z.string() }) },
      },
    },
    (request) => {
      const auth = requireAuth(request, { allowPendingTwoFactor: true });
      return setupTotp(deps, auth.userId);
    },
  );

  app.post(
    '/2fa/enable',
    {
      config: { access: 'authenticated', allowPendingTwoFactor: true },
      schema: {
        tags: ['auth'],
        body: z.object({ code: totpCode }),
        response: { 200: z.object({ recoveryCodes: z.array(z.string()) }) },
      },
    },
    (request) => {
      const auth = requireAuth(request, { allowPendingTwoFactor: true });
      return enableTotp(deps, auth.userId, auth.sessionId, request.body.code);
    },
  );

  app.post(
    '/2fa/verify',
    {
      config: { access: 'authenticated', allowPendingTwoFactor: true },
      schema: {
        tags: ['auth'],
        body: z
          .object({
            code: totpCode.optional(),
            recoveryCode: z.string().min(10).max(20).optional(),
          })
          .refine((body) => (body.code === undefined) !== (body.recoveryCode === undefined), {
            error: 'provide exactly one of code or recoveryCode',
          }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, { allowPendingTwoFactor: true });
      await verifySecondFactor(deps, auth.userId, auth.sessionId, request.body);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/password',
    {
      config: { access: 'authenticated' },
      schema: {
        tags: ['auth'],
        body: z.object({
          currentPassword: z.string().min(1).max(256),
          newPassword: z.string().min(1).max(256),
        }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      await changePassword(deps, auth.userId, auth.sessionId, request.body);
      return reply.status(204).send(null);
    },
  );

  return Promise.resolve();
};
