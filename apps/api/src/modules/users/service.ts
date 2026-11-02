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
  if (input.roles && !canAssignRoles(actor.roles, input.roles)) {
    throw new AppError('FORBIDDEN', 'You cannot grant these roles');
  }
  if (userId === actor.userId && (input.isActive === false || input.roles !== undefined)) {
    throw new AppError('FORBIDDEN', 'You cannot change your own roles or deactivate yourself');
  }
  const losesOwner =
    target.roles.includes('OWNER') &&
    ((input.roles !== undefined && !input.roles.includes('OWNER')) || input.isActive === false);
  if (losesOwner) {
    const owners = await db.user.count({ where: { roles: { has: 'OWNER' }, isActive: true } });
    if (owners <= 1) throw new AppError('CONFLICT', 'The last active owner cannot be removed');
  }
  if (input.storeIds) await assertStoresExist(db, input.storeIds);

  const updated = await db.$transaction(async (tx) => {
    if (input.storeIds) {
      await tx.userStoreAccess.deleteMany({ where: { userId } });
      await tx.userStoreAccess.createMany({
        data: input.storeIds.map((storeId) => ({ userId, storeId })),
      });
    }
    return tx.user.update({
      where: { id: userId },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.roles === undefined ? {} : { roles: input.roles }),
        ...(input.locale === undefined ? {} : { locale: input.locale }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
      include: withAccess,
    });
  });

  // Privileges or access changed: existing sessions must not keep the old rights.
  const privilegesChanged =
    (input.roles !== undefined &&
      [...input.roles].sort().join() !== [...target.roles].sort().join()) ||
    input.isActive === false ||
    input.storeIds !== undefined;
  if (privilegesChanged) await revokeUserSessions(db, clock, userId);

  await recordAudit(db, {
    actorType: 'USER',
    actorUserId: actor.userId,
    action: 'user.updated',
    entityType: 'User',
    entityId: userId,
    before: snapshot(target),
    after: snapshot(updated),
    meta: { sessionsRevoked: privilegesChanged },
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
  await deps.db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  await revokeUserSessions(deps.db, deps.clock, userId);
  await recordAudit(deps.db, {
    actorType: 'USER',
    actorUserId: actor.userId,
    action: 'user.password.reset',
    entityType: 'User',
    entityId: userId,
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
  });
  await revokeUserSessions(deps.db, deps.clock, userId);
  await recordAudit(deps.db, {
    actorType: 'USER',
    actorUserId: actor.userId,
    action: 'user.2fa.reset',
    entityType: 'User',
    entityId: userId,
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
