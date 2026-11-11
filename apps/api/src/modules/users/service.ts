import type { Clock } from '@dz/core';
import { AppError } from '@dz/core/errors';
import type { DbClient, Locale, Prisma, User } from '@dz/db';
import { canAssignRoles, canManageUser } from '@dz/domain';
import type { Role } from '@dz/domain';

import { recordAudit } from '../audit/audit.ts';
import type { AuthContext } from '../auth/context.ts';
import { checkPasswordPolicy, hashPassword } from '../auth/password.ts';
import { revokeUserSessions } from '../auth/sessions.ts';

export interface UsersDependencies {
  db: DbClient;
  clock: Clock;
}

type UserWithAccess = User & { storeAccess: { storeId: string }[] };

export function toUserDto(user: UserWithAccess) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    locale: user.locale,
    isActive: user.isActive,
    storeIds: user.storeAccess.map((access) => access.storeId).sort(),
    totpEnabled: user.totpEnabledAt !== null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

const withAccess = { storeAccess: { select: { storeId: true } } } as const;

/** Audit snapshot: no e-mail or name (personal data stays out of the audit trail). */
function snapshot(user: UserWithAccess): Prisma.InputJsonObject {
  return {
    roles: user.roles,
    locale: user.locale,
    isActive: user.isActive,
    storeIds: user.storeAccess.map((access) => access.storeId).sort(),
  };
}

function assertPasswordPolicy(password: string, email: string) {
  const violations = checkPasswordPolicy(password, email);
  if (violations.length > 0) {
    throw new AppError('VALIDATION_FAILED', 'Password does not meet the policy', {
      details: { violations },
    });
  }
}

async function assertStoresExist(db: DbClient, storeIds: readonly string[]) {
  if (storeIds.length === 0) return;
  const found = await db.store.count({ where: { id: { in: [...storeIds] } } });
  if (found !== new Set(storeIds).size) {
    throw new AppError('VALIDATION_FAILED', 'Unknown store', { details: { field: 'storeIds' } });
  }
}

async function manageableTarget(deps: UsersDependencies, actor: AuthContext, userId: string) {
  const target = await deps.db.user.findUnique({ where: { id: userId }, include: withAccess });
  if (!target) throw new AppError('NOT_FOUND', 'User not found');
  if (!canManageUser(actor.roles, target.roles)) {
    throw new AppError('FORBIDDEN', 'You cannot manage this account');
  }
  return target;
}

export interface CreateUserInput {
  email: string;
  name: string;
  roles: Role[];
  locale: Locale;
  storeIds: string[];
  password: string;
}

export async function createUser(
  deps: UsersDependencies,
  actor: AuthContext,
  input: CreateUserInput,
) {
  if (!canAssignRoles(actor.roles, input.roles)) {
    throw new AppError('FORBIDDEN', 'You cannot grant these roles');
  }
  assertPasswordPolicy(input.password, input.email);
  await assertStoresExist(deps.db, input.storeIds);
  const existing = await deps.db.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError('CONFLICT', 'An account already uses this e-mail');

  const user = await deps.db.user.create({
    data: {
      email: input.email,
      name: input.name,
      roles: input.roles,
      locale: input.locale,
      passwordHash: await hashPassword(input.password),
      storeAccess: { create: input.storeIds.map((storeId) => ({ storeId })) },
    },
    include: withAccess,
  });
  await recordAudit(deps.db, {
    actorType: 'USER',
    actorUserId: actor.userId,
    action: 'user.created',
    entityType: 'User',
    entityId: user.id,
    after: snapshot(user),
  });
  return toUserDto(user);
}

export interface UpdateUserInput {
  name?: string | undefined;
  roles?: Role[] | undefined;
  locale?: Locale | undefined;
  storeIds?: string[] | undefined;
  isActive?: boolean | undefined;
}

export async function updateUser(
  deps: UsersDependencies,
  actor: AuthContext,
  userId: string,
  input: UpdateUserInput,
) {
  const { db, clock } = deps;
  const target = await manageableTarget(deps, actor, userId);
  // Only real changes count: the admin form sends every field on each save (BUG-008).
  const sameSet = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const rolesChanged = input.roles !== undefined && !sameSet(input.roles, target.roles);
  const storesChanged =
    input.storeIds !== undefined &&
    !sameSet(
      input.storeIds,
      target.storeAccess.map((access) => access.storeId),
    );
  const deactivated = input.isActive === false && target.isActive;
  if (rolesChanged && input.roles && !canAssignRoles(actor.roles, input.roles)) {
    throw new AppError('FORBIDDEN', 'You cannot grant these roles');
  }
  if (userId === actor.userId && (deactivated || rolesChanged)) {
    throw new AppError('FORBIDDEN', 'You cannot change your own roles or deactivate yourself');
  }
  const losesOwner =
    target.isActive &&
    target.roles.includes('OWNER') &&
    ((rolesChanged && input.roles !== undefined && !input.roles.includes('OWNER')) || deactivated);
  if (storesChanged && input.storeIds) await assertStoresExist(db, input.storeIds);
  const privilegesChanged = rolesChanged || deactivated || storesChanged;

  // One transaction: change, session revocation and audit succeed or fail together.
  const updated = await db.$transaction(async (tx) => {
    if (losesOwner) {
      // Serialises concurrent owner changes (transaction-level lock: safe behind PgBouncer).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('dz:owners'))`;
      const others = await tx.user.count({
        where: { roles: { has: 'OWNER' }, isActive: true, id: { not: userId } },
      });
      if (others === 0) throw new AppError('CONFLICT', 'The last active owner cannot be removed');
    }
    if (storesChanged && input.storeIds) {
      await tx.userStoreAccess.deleteMany({ where: { userId } });
      await tx.userStoreAccess.createMany({
        data: input.storeIds.map((storeId) => ({ userId, storeId })),
      });
    }
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(rolesChanged && input.roles ? { roles: input.roles } : {}),
        ...(input.locale === undefined ? {} : { locale: input.locale }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
      include: withAccess,
    });
    // Privileges or access changed: existing sessions must not keep the old rights.
    if (privilegesChanged) await revokeUserSessions(tx, clock, userId);
    await recordAudit(tx, {
      actorType: 'USER',
      actorUserId: actor.userId,
      action: 'user.updated',
      entityType: 'User',
      entityId: userId,
      before: snapshot(target),
      after: snapshot(user),
      meta: { sessionsRevoked: privilegesChanged },
    });
    return user;
  });
  return toUserDto(updated);
}

export async function resetPassword(
  deps: UsersDependencies,
  actor: AuthContext,
  userId: string,
  newPassword: string,
) {
  if (userId === actor.userId) {
    throw new AppError('FORBIDDEN', 'Use the password change flow for your own account');
  }
  const target = await manageableTarget(deps, actor, userId);
  assertPasswordPolicy(newPassword, target.email);
  const passwordHash = await hashPassword(newPassword);
  await deps.db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, failedLoginCount: 0, lastFailedLoginAt: null, lockedUntil: null },
    });
    await revokeUserSessions(tx, deps.clock, userId);
    await recordAudit(tx, {
      actorType: 'USER',
      actorUserId: actor.userId,
      action: 'user.password.reset',
      entityType: 'User',
      entityId: userId,
    });
  });
}

export async function resetTwoFactor(deps: UsersDependencies, actor: AuthContext, userId: string) {
  if (userId === actor.userId)
    throw new AppError('FORBIDDEN', 'You cannot reset your own second factor');
  const target = await manageableTarget(deps, actor, userId);
  await deps.db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { totpEnabledAt: null, totpLastUsedStep: null, recoveryCodes: [], totpSecretId: null },
    });
    if (target.totpSecretId) await tx.secret.delete({ where: { id: target.totpSecretId } });
    await revokeUserSessions(tx, deps.clock, userId);
    await recordAudit(tx, {
      actorType: 'USER',
      actorUserId: actor.userId,
      action: 'user.2fa.reset',
      entityType: 'User',
      entityId: userId,
    });
  });
}

export interface ListUsersQuery {
  q?: string | undefined;
  role?: Role | undefined;
  active?: boolean | undefined;
  cursor?: string | undefined;
  limit: number;
}

export async function listUsers(deps: UsersDependencies, query: ListUsersQuery) {
  const users = await deps.db.user.findMany({
    where: {
      ...(query.role === undefined ? {} : { roles: { has: query.role } }),
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { name: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }),
      ...(query.cursor === undefined ? {} : { id: { lt: query.cursor } }),
    },
    orderBy: { id: 'desc' },
    take: query.limit + 1,
    include: withAccess,
  });
  const page = users.slice(0, query.limit);
  return {
    items: page.map(toUserDto),
    nextCursor: users.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function getUser(deps: UsersDependencies, userId: string) {
  const user = await deps.db.user.findUnique({ where: { id: userId }, include: withAccess });
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  return toUserDto(user);
}
