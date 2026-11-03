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

const LOCKOUT = { threshold: 5, baseMs: 15 * 60_000, maxMs: 24 * 60 * 60_000 } as const;

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
    const failures = user.failedLoginCount + 1;
    const lockedUntil =
      failures >= LOCKOUT.threshold
        ? new Date(
            now.getTime() +
              Math.min(LOCKOUT.baseMs * 2 ** (failures - LOCKOUT.threshold), LOCKOUT.maxMs),
          )
        : null;
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failures, lockedUntil },
    });
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
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
  });
  const secondFactorPending = requiresTwoFactor(user.roles) || user.totpEnabledAt !== null;
  const created = await createSession(db, clock, {
    userId: user.id,
    kind: input.kind,
    remembered: input.remember,
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

  await recordAudit(db, {
    actorType: 'USER',
    actorUserId: user.id,
    action: accepted ? 'auth.2fa.verified' : 'auth.2fa.failed',
    entityType: 'User',
    entityId: user.id,
    meta: { method },
  });
  if (!accepted) throw new AppError('INVALID_TWO_FACTOR_CODE', 'Invalid two-factor code');
  await db.session.update({ where: { id: sessionId }, data: { twoFactorVerified: true } });
}

/** Changes the password and revokes every other session of the user. */
export async function changePassword(
  deps: AuthDependencies,
  userId: string,
  sessionId: string,
  input: { currentPassword: string; newPassword: string },
) {
  const { db, clock } = deps;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) throw invalidCredentials();
  const violations = checkPasswordPolicy(input.newPassword, user.email);
  if (violations.length > 0) {
    throw new AppError('VALIDATION_FAILED', 'Password does not meet the policy', {
      details: { violations },
    });
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
  const revoked = await revokeUserSessions(db, clock, user.id, { except: sessionId });
  await recordAudit(db, {
    actorType: 'USER',
    actorUserId: user.id,
    action: 'auth.password.changed',
    entityType: 'User',
    entityId: user.id,
    meta: { revokedSessions: revoked },
  });
}
