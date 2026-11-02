import { AppError } from '@dz/core/errors';
import type { Role, Session, SessionKind, User, UserStoreAccess } from '@dz/db';
import type { FastifyRequest } from 'fastify';

export type TwoFactorState =
  'verified' | 'not_required' | 'verification_required' | 'enrolment_required';

/** Authenticated principal attached to the request by the auth hook. */
export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  roles: Role[];
  locale: User['locale'];
  sessionId: string;
  sessionKind: SessionKind;
  twoFactor: TwoFactorState;
  totpEnabled: boolean;
  /** Stores this user may act on: every store for OWNER/ADMIN, the assigned ones for agents. */
  storeIds: string[] | 'all';
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/** ADR-0007: two-factor authentication is mandatory for OWNER and ADMIN. */
export function requiresTwoFactor(roles: readonly Role[]): boolean {
  return roles.includes('OWNER') || roles.includes('ADMIN');
}

export function twoFactorState(user: User, session: Session): TwoFactorState {
  if (session.twoFactorVerified) return user.totpEnabledAt ? 'verified' : 'not_required';
  return user.totpEnabledAt ? 'verification_required' : 'enrolment_required';
}

export type UserWithStores = User & { storeAccess: Pick<UserStoreAccess, 'storeId'>[] };

export function storeScopeOf(user: UserWithStores): string[] | 'all' {
  return requiresTwoFactor(user.roles) ? 'all' : user.storeAccess.map((access) => access.storeId);
}

export function toAuthContext(user: UserWithStores, session: Session): AuthContext {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    locale: user.locale,
    sessionId: session.id,
    sessionKind: session.kind,
    twoFactor: twoFactorState(user, session),
    totpEnabled: user.totpEnabledAt !== null,
    storeIds: storeScopeOf(user),
  };
}

/** Prisma filter restricting a query to the stores of the caller (data-layer scoping). */
export function storeFilter(auth: AuthContext): { in: string[] } | undefined {
  return auth.storeIds === 'all' ? undefined : { in: auth.storeIds };
}

/** Out-of-scope resources look absent: no information leaks about other stores. */
export function assertStoreAccess(auth: AuthContext, storeId: string): void {
  if (auth.storeIds !== 'all' && !auth.storeIds.includes(storeId)) {
    throw new AppError('NOT_FOUND', 'Resource not found');
  }
}

/**
 * Returns the authenticated principal or throws. By default the second factor must be completed;
 * a few auth routes (me, 2FA setup/verify, logout) accept a pending second factor.
 */
export function requireAuth(
  request: FastifyRequest,
  { allowPendingTwoFactor = false }: { allowPendingTwoFactor?: boolean } = {},
): AuthContext {
  const auth = request.auth;
  if (!auth) throw new AppError('UNAUTHENTICATED', 'Authentication required');
  if (!allowPendingTwoFactor) {
    if (auth.twoFactor === 'verification_required') {
      throw new AppError('TWO_FACTOR_REQUIRED', 'Second factor verification required');
    }
    if (auth.twoFactor === 'enrolment_required') {
      throw new AppError('TWO_FACTOR_ENROLMENT_REQUIRED', 'Two-factor enrolment required');
    }
  }
  return auth;
}
