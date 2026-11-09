import type { Clock } from '@dz/core';
import { sha256Hex } from '@dz/core/crypto';
import type { DbExecutor } from '@dz/db';

/** Fixed-window rate limiting stored in PostgreSQL (UNLOGGED table, ARCHITECTURE §6). */
export interface RateLimitRule {
  name: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const MINUTE = 60_000;

export const RATE_LIMITS = {
  loginByIp: { name: 'login:ip', limit: 20, windowMs: 15 * MINUTE },
  loginByAccount: { name: 'login:account', limit: 10, windowMs: 15 * MINUTE },
  twoFactorBySession: { name: '2fa:session', limit: 5, windowMs: 5 * MINUTE },
  twoFactorByUser: { name: '2fa:user', limit: 10, windowMs: 15 * MINUTE },
  /** Checking the current password must not become a password oracle for a stolen session. */
  passwordChangeByUser: { name: 'password-change:user', limit: 5, windowMs: 15 * MINUTE },
} as const satisfies Record<string, RateLimitRule>;

/** Counts one hit for `identifier` (IP, e-mail, session…). Identifiers are stored hashed. */
export async function consumeRateLimit(
  db: DbExecutor,
  clock: Clock,
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  const now = clock.now().getTime();
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
  const windowEnd = windowStart + rule.windowMs;
  const key = sha256Hex(`${rule.name}:${identifier}`);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
    VALUES (${key}, ${new Date(windowStart)}, 1, ${new Date(windowEnd)})
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  const count = rows[0]?.count ?? Number.POSITIVE_INFINITY;
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
  };
}

/** Maintenance: deletes expired windows (scheduled job, P0-08). */
export async function purgeExpiredRateLimits(db: DbExecutor, now: Date): Promise<number> {
  const { count } = await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
  return count;
}
