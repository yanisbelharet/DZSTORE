import { AppError } from '@dz/core/errors';
import { can } from '@dz/domain';
import type { Permission } from '@dz/domain';
import type { FastifyBaseLogger, FastifyTypeProvider } from 'fastify';

import { requireAuth } from '../modules/auth/context.ts';
import type { AnyApp } from './types.ts';

/**
 * Access rule every `/v1/*` route must declare (ADR-0008):
 * - `public`: no session (login, public store endpoints with their own guard);
 * - `authenticated`: any signed-in user (own profile, sessions…);
 * - `{ permission }`: the user's roles must grant this permission.
 */
export type Access = 'public' | 'authenticated' | { permission: Permission };

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: Access;
    /** Allows a session whose second factor is still pending (2FA setup/verify, me). */
    allowPendingTwoFactor?: boolean;
  }
}

export interface RouteAccess {
  method: string;
  url: string;
  access: Access;
}

/**
 * Refuses to start if a `/v1/*` route has no access rule, then enforces rules on each request.
 * Runs in `onRequest` (after authentication, before body validation): an unauthorised caller
 * gets 401/403, never a validation error that would reveal the route's contract.
 */
export function registerAccessControl<L extends FastifyBaseLogger, P extends FastifyTypeProvider>(
  app: AnyApp<L, P>,
): RouteAccess[] {
  const routes: RouteAccess[] = [];
  app.addHook('onRoute', (route) => {
    if (!route.url.startsWith('/v1/')) return;
    const access = route.config?.access;
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (access === undefined) {
      throw new Error(`Route ${methods.join(',')} ${route.url} declares no access rule`);
    }
    for (const method of methods) routes.push({ method, url: route.url, access });
  });

  app.addHook('onRequest', (request, _reply, done) => {
    const { access, allowPendingTwoFactor } = request.routeOptions.config;
    if (access === undefined || access === 'public') {
      done();
      return;
    }
    const auth = requireAuth(request, { allowPendingTwoFactor: allowPendingTwoFactor === true });
    if (access !== 'authenticated' && !can(auth.roles, access.permission)) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions');
    }
    done();
  });
  return routes;
}
