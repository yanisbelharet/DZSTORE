import { isIPv4, isIPv6 } from 'node:net';

import type { Clock } from '@dz/core';
import { randomToken, sha256Hex } from '@dz/core/crypto';
import type { DbExecutor, Session, SessionKind } from '@dz/db';

import type { UserWithStores } from './context.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** ADR-0007: opaque tokens, sliding idle expiry, absolute expiry. */
export const SESSION_POLICY = {
  idleMs: 12 * HOUR,
  rememberedIdleMs: 7 * DAY,
  absoluteMs: 30 * DAY,
  touchThrottleMs: 5 * MINUTE,
} as const;

/** Truncated IP for the "active sessions" screen (data minimisation): /24 or /48. */
export function ipPrefix(ip: string | undefined): string | null {
  if (ip === undefined) return null;
  const mapped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIPv4(mapped)) return `${mapped.split('.').slice(0, 3).join('.')}.0/24`;
  if (isIPv6(mapped)) return `${mapped.split(':').slice(0, 3).join(':')}::/48`;
  return null;
}

export interface NewSession {
  userId: string;
  kind: SessionKind;
  remembered: boolean;
  twoFactorVerified: boolean;
  ip: string | undefined;
  userAgent: string | undefined;
}

function idleMs(remembered: boolean): number {
  return remembered ? SESSION_POLICY.rememberedIdleMs : SESSION_POLICY.idleMs;
}

export async function createSession(db: DbExecutor, clock: Clock, input: NewSession) {
  const now = clock.now();
  const token = randomToken(32);
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_POLICY.absoluteMs);
  const session = await db.session.create({
    data: {
      userId: input.userId,
      tokenHash: sha256Hex(token),
      kind: input.kind,
      remembered: input.remembered,
      twoFactorVerified: input.twoFactorVerified,
      ipPrefix: ipPrefix(input.ip),
      userAgent: input.userAgent?.slice(0, 256) ?? null,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + idleMs(input.remembered)),
      absoluteExpiresAt,
    },
  });
  return { token, session };
}

/** Active session for a token, or null (unknown, revoked, idle- or absolutely expired, user disabled). */
export async function findActiveSession(
  db: DbExecutor,
  clock: Clock,
  token: string,
): Promise<{ session: Session; user: UserWithStores } | null> {
  if (token.length < 20 || token.length > 128) return null;
  const now = clock.now();
  const found = await db.session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { user: { include: { storeAccess: { select: { storeId: true } } } } },
  });
  if (!found) return null;
  if (
    found.revokedAt !== null ||
    found.expiresAt <= now ||
    found.absoluteExpiresAt <= now ||
    !found.user.isActive
  ) {
    return null;
  }
  const { user, ...session } = found;
  return { session, user };
}

/** Slides the idle expiry, at most once per throttle period (limits writes). */
export async function touchSession(db: DbExecutor, clock: Clock, session: Session): Promise<void> {
  const now = clock.now().getTime();
  if (now - session.lastSeenAt.getTime() < SESSION_POLICY.touchThrottleMs) return;
  const expiresAt = Math.min(now + idleMs(session.remembered), session.absoluteExpiresAt.getTime());
  await db.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date(now), expiresAt: new Date(expiresAt) },
  });
}

export async function revokeSession(
  db: DbExecutor,
  clock: Clock,
  sessionId: string,
): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: clock.now() },
  });
}

export async function revokeUserSessions(
  db: DbExecutor,
  clock: Clock,
  userId: string,
  { except }: { except?: string } = {},
): Promise<number> {
  const { count } = await db.session.updateMany({
    where: { userId, revokedAt: null, ...(except === undefined ? {} : { id: { not: except } }) },
    data: { revokedAt: clock.now() },
  });
  return count;
}
