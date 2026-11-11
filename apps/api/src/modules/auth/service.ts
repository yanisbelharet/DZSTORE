import type { Clock } from '@dz/core';
import { AppError } from '@dz/core/errors';
import { sha256Hex } from '@dz/core/crypto';
import type { SecretBox } from '@dz/core/crypto';
import type { DbClient, SessionKind, User } from '@dz/db';

import { recordAudit } from '../audit/audit.ts';
import { consumeRateLimit, RATE_LIMITS } from '../rate-limit/rate-limit.ts';
import type { RateLimitRule } from '../rate-limit/rate-limit.ts';
import { requiresTwoFactor } from './context.ts';
import {
  checkPasswordPolicy,
  generateRecoveryCodes,
  hashPassword,
  hashRecoveryCode,
  verifyAgainstDummy,
  verifyPassword,
} from './password.ts';
import { createSession, ipPrefix, revokeUserSessions } from './sessions.ts';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp.ts';

export interface AuthDependencies {
  db: DbClient;
  clock: Clock;
  secretBox: SecretBox;
}

export interface RequestInfo {
  ip: string | undefined;
  userAgent: string | undefined;
}

const LOCKOUT = {
  threshold: 5,
  baseMs: 15 * 60_000,
  maxMs: 24 * 60 * 60_000,
  /** Failures older than this no longer count (an attacker cannot keep an account locked forever). */
  decayMs: 24 * 60 * 60_000,
} as const;
/** Consecutive second-factor failures before the account is locked and its sessions revoked. */
const TWO_FACTOR_LOCK = { threshold: 20, lockMs: 24 * 60 * 60_000 } as const;

const invalidCredentials = () =>
  new AppError('INVALID_CREDENTIALS', 'Invalid credentials or account temporarily locked');

async function enforceRateLimit(
  deps: AuthDependencies,
  rule: RateLimitRule,
  identifier: string,
): Promise<void> {
  const result = await consumeRateLimit(deps.db, deps.clock, rule, identifier);
  if (!result.allowed) {
    throw new AppError('RATE_LIMITED', 'Too many attempts, try again later', {
      details: { retryAfterSeconds: result.retryAfterSeconds },
    });
  }
}

/** Encryption context of a user's TOTP secret (also used by the demo seed). */
export const totpContext = (userId: string) => `user-totp:${userId}`;

async function totpSecretOf(deps: AuthDependencies, user: User): Promise<string> {
  if (!user.totpSecretId) throw new AppError('CONFLICT', 'Two-factor setup has not been started');
  const secret = await deps.db.secret.findUniqueOrThrow({ where: { id: user.totpSecretId } });
  return deps.secretBox.decrypt(secret, { context: totpContext(user.id) });
}

export interface LoginInput extends RequestInfo {
  email: string;
  password: string;
  kind: SessionKind;
  remember: boolean;
}

/** Password login (ADR-0007). Failures never reveal whether the account exists or is locked. */
export async function login(deps: AuthDependencies, input: LoginInput) {
  const { db, clock } = deps;
  await enforceRateLimit(deps, RATE_LIMITS.loginByIp, input.ip ?? 'unknown');
  await enforceRateLimit(deps, RATE_LIMITS.loginByAccount, input.email);
  const now = clock.now();
  const audit = { actorType: 'USER' as const, entityType: 'User', ipPrefix: ipPrefix(input.ip) };

  const user = await db.user.findUnique({
    where: { email: input.email },
    include: { storeAccess: { select: { storeId: true } } },
  });
  if (!user?.isActive || (user.lockedUntil !== null && user.lockedUntil > now)) {
    await verifyAgainstDummy(input.password);
    await recordAudit(db, {
      ...audit,
      action: 'auth.login.failed',
      entityId: user?.id ?? null,
      meta: {
        reason: !user ? 'UNKNOWN_ACCOUNT' : !user.isActive ? 'INACTIVE' : 'LOCKED',
        emailHash: sha256Hex(input.email).slice(0, 16),
      },
    });
    throw invalidCredentials();
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    // Atomic increment: concurrent failures are all counted (no read-modify-write).
    const decayedBefore = new Date(now.getTime() - LOCKOUT.decayMs);
    const [counted] = await db.$queryRaw<{ failures: number }[]>`
      UPDATE "User" SET
        "failedLoginCount" = CASE
          WHEN "lastFailedLoginAt" IS NULL OR "lastFailedLoginAt" < ${decayedBefore}::timestamptz THEN 1
          ELSE "failedLoginCount" + 1 END,
        "lastFailedLoginAt" = ${now}::timestamptz
      WHERE "id" = ${user.id}::uuid
      RETURNING "failedLoginCount" AS failures`;
    const failures = counted?.failures ?? 1;
    // Accounts protected by a second factor are never hard-locked by password failures: a
    // password alone cannot open them, and a lock would let anyone deny access to the OWNER.
    const lockedUntil =
      failures >= LOCKOUT.threshold && user.totpEnabledAt === null
        ? new Date(
            now.getTime() +
              Math.min(LOCKOUT.baseMs * 2 ** (failures - LOCKOUT.threshold), LOCKOUT.maxMs),
          )
        : null;
    if (lockedUntil) await db.user.update({ where: { id: user.id }, data: { lockedUntil } });
    await recordAudit(db, {
      ...audit,
      action: lockedUntil ? 'auth.account.locked' : 'auth.login.failed',
      entityId: user.id,
      meta: { reason: 'BAD_PASSWORD', failures },
    });
    throw invalidCredentials();
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lastFailedLoginAt: null, lockedUntil: null, lastLoginAt: now },
  });
  const secondFactorPending = requiresTwoFactor(user.roles) || user.totpEnabledAt !== null;
  const created = await createSession(db, clock, {
    userId: user.id,
    kind: input.kind,
    // « Se souvenir » (7 days of inactivity) is for the OWNER only; others keep 12 h.
    remembered: input.remember && user.roles.includes('OWNER'),
    twoFactorVerified: !secondFactorPending,
    ip: input.ip,
    userAgent: input.userAgent,
  });
  await recordAudit(db, {
    ...audit,
    actorUserId: user.id,
    action: 'auth.login.succeeded',
    entityId: user.id,
    meta: { sessionKind: input.kind, secondFactorPending },
  });
  return { ...created, user };
}

/** Starts (or restarts) TOTP enrolment: the secret is stored encrypted but not yet active. */
export async function setupTotp(deps: AuthDependencies, userId: string) {
  const user = await deps.db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.totpEnabledAt)
    throw new AppError('CONFLICT', 'Two-factor authentication is already enabled');
  const secret = generateTotpSecret();
  const sealed = deps.secretBox.encrypt(secret, { context: totpContext(user.id) });
  const data = {
    kind: 'TOTP_SECRET' as const,
    ciphertext: Buffer.from(sealed.ciphertext),
    iv: Buffer.from(sealed.iv),
    authTag: Buffer.from(sealed.authTag),
    keyVersion: sealed.keyVersion,
    last4: null,
  };
  if (user.totpSecretId) {
    await deps.db.secret.update({ where: { id: user.totpSecretId }, data });
  } else {
    await deps.db.user.update({
      where: { id: user.id },
      data: { totpSecret: { create: data } },
    });
  }
  return { secret, otpauthUrl: otpauthUrl({ secret, account: user.email }) };
}

/** Confirms enrolment with a first code; returns single-use recovery codes (shown once). */
export async function enableTotp(
  deps: AuthDependencies,
  userId: string,
  sessionId: string,
  code: string,
) {
  const { db, clock } = deps;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.totpEnabledAt)
    throw new AppError('CONFLICT', 'Two-factor authentication is already enabled');
  const step = verifyTotp(await totpSecretOf(deps, user), code, clock.now());
  if (step === null) throw new AppError('INVALID_TWO_FACTOR_CODE', 'Invalid two-factor code');
  const recoveryCodes = generateRecoveryCodes();
  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: {
        totpEnabledAt: clock.now(),
        totpLastUsedStep: step,
        recoveryCodes: recoveryCodes.map(hashRecoveryCode),
      },
    }),
    db.session.update({ where: { id: sessionId }, data: { twoFactorVerified: true } }),
  ]);
  await recordAudit(db, {
    actorType: 'USER',
    actorUserId: user.id,
    action: 'auth.2fa.enabled',
    entityType: 'User',
    entityId: user.id,
  });
  return { recoveryCodes };
}

/** Completes the second factor of a session, with a TOTP code or a single-use recovery code. */
export async function verifySecondFactor(
  deps: AuthDependencies,
  userId: string,
  sessionId: string,
  proof: { code?: string | undefined; recoveryCode?: string | undefined },
) {
  const { db, clock } = deps;
  await enforceRateLimit(deps, RATE_LIMITS.twoFactorBySession, sessionId);
  await enforceRateLimit(deps, RATE_LIMITS.twoFactorByUser, userId);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpEnabledAt) {
    throw new AppError('TWO_FACTOR_ENROLMENT_REQUIRED', 'Two-factor enrolment required');
  }

  let accepted = false;
  let method: 'totp' | 'recovery_code' = 'totp';
  if (proof.code !== undefined) {
    const step = verifyTotp(await totpSecretOf(deps, user), proof.code, clock.now(), {
      lastUsedStep: user.totpLastUsedStep,
    });
    if (step !== null) {
      // Atomic anti-replay: only one request can consume a given time step.
      const { count } = await db.user.updateMany({
        where: {
          id: user.id,
          OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: step } }],
        },
        data: { totpLastUsedStep: step },
      });
      accepted = count === 1;
    }
  } else if (proof.recoveryCode !== undefined) {
    method = 'recovery_code';
    const hashed = hashRecoveryCode(proof.recoveryCode);
    const consumed = await db.$executeRaw`
      UPDATE "User" SET "recoveryCodes" = array_remove("recoveryCodes", ${hashed})
      WHERE "id" = ${user.id}::uuid AND ${hashed} = ANY("recoveryCodes")`;
    accepted = consumed === 1;
  }

  if (!accepted) {
    const [counted] = await db.$queryRaw<{ failures: number }[]>`
      UPDATE "User" SET "failedTwoFactorCount" = "failedTwoFactorCount" + 1
      WHERE "id" = ${user.id}::uuid
      RETURNING "failedTwoFactorCount" AS failures`;
    const failures = counted?.failures ?? 1;
    const locked = failures >= TWO_FACTOR_LOCK.threshold;
    await db.$transaction(async (tx) => {
      if (locked) {
        // Someone holds the password and is guessing codes: lock, close every session, alert.
        await tx.user.update({
          where: { id: user.id },
          data: {
            lockedUntil: new Date(clock.now().getTime() + TWO_FACTOR_LOCK.lockMs),
            failedTwoFactorCount: 0,
          },
        });
        await revokeUserSessions(tx, clock, user.id);
      }
      await recordAudit(tx, {
        actorType: 'USER',
        actorUserId: user.id,
        action: locked ? 'auth.2fa.locked' : 'auth.2fa.failed',
        entityType: 'User',
        entityId: user.id,
        meta: { method, failures },
      });
    });
    throw new AppError('INVALID_TWO_FACTOR_CODE', 'Invalid two-factor code');
  }
  await db.$transaction([
    db.session.update({ where: { id: sessionId }, data: { twoFactorVerified: true } }),
    db.user.update({ where: { id: user.id }, data: { failedTwoFactorCount: 0 } }),
  ]);
  await recordAudit(db, {
    actorType: 'USER',
    actorUserId: user.id,
    action: 'auth.2fa.verified',
    entityType: 'User',
    entityId: user.id,
    meta: { method },
  });
}

/** Changes the password and revokes every other session of the user. */
export async function changePassword(
  deps: AuthDependencies,
  userId: string,
  sessionId: string,
  input: { currentPassword: string; newPassword: string },
) {
  const { db, clock } = deps;
  await enforceRateLimit(deps, RATE_LIMITS.passwordChangeByUser, userId);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) throw invalidCredentials();
  const violations = checkPasswordPolicy(input.newPassword, user.email);
  if (violations.length > 0) {
    throw new AppError('VALIDATION_FAILED', 'Password does not meet the policy', {
      details: { violations },
    });
  }
  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    const revoked = await revokeUserSessions(tx, clock, user.id, { except: sessionId });
    await recordAudit(tx, {
      actorType: 'USER',
      actorUserId: user.id,
      action: 'auth.password.changed',
      entityType: 'User',
      entityId: user.id,
      meta: { revokedSessions: revoked },
    });
  });
}
