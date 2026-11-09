import { AppError } from '@dz/core/errors';
import type {} from '@fastify/cookie';
import type { FastifyBaseLogger, FastifyTypeProvider } from 'fastify';

import type { AnyApp } from '../../http/types.ts';

import type { AuthDependencies } from './service.ts';
import { findActiveSession, touchSession } from './sessions.ts';
import { toAuthContext } from './context.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Header every first-party client sends on mutating requests (ADR-0021, CSRF). */
export const CSRF_HEADER = 'x-dz-csrf';

export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-dz_session' : 'dz_session';
}

function bearerToken(header: string | undefined): string | undefined {
  const match = header === undefined ? null : /^Bearer\s+(\S+)$/u.exec(header);
  return match?.[1];
}

/**
 * Resolves the session of each request (cookie for the web admin, Bearer for mobile) and
 * enforces the anti-CSRF header on cookie-based mutating requests.
 */
export function registerAuthentication<L extends FastifyBaseLogger, P extends FastifyTypeProvider>(
  app: AnyApp<L, P>,
  deps: AuthDependencies & { cookieSecure: boolean },
) {
  const cookieName = sessionCookieName(deps.cookieSecure);
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request) => {
    const bearer = bearerToken(request.headers.authorization);
    // Decided on the MATCHED route, never on the raw URL: `/%761/users` reaches `/v1/users`.
    // Every unsafe request without a Bearer token needs the header, except machine endpoints
    // that carry their own secret (`/v1/internal/*`).
    const route = request.routeOptions.url;
    const machineEndpoint = route?.startsWith('/v1/internal/') === true;
    if (
      !SAFE_METHODS.has(request.method) &&
      bearer === undefined &&
      !machineEndpoint &&
      request.headers[CSRF_HEADER] !== '1'
    ) {
      throw new AppError('CSRF_FAILED', 'Missing anti-CSRF header');
    }

    const token = bearer ?? request.cookies[cookieName];
    if (token === undefined) return;
    const found = await findActiveSession(deps.db, deps.clock, token);
    // A token must be used through the channel it was issued for.
    if (!found || (bearer !== undefined) !== (found.session.kind === 'MOBILE')) return;
    request.auth = toAuthContext(found.user, found.session);
    await touchSession(deps.db, deps.clock, found.session);
  });
}
