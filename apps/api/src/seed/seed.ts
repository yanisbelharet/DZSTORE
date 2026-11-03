import type { SecretBox } from '@dz/core/crypto';
import { AppError } from '@dz/core/errors';
import type { DbClient } from '@dz/db';

import { checkPasswordPolicy, hashPassword, verifyPassword } from '../modules/auth/password.ts';
import { totpContext } from '../modules/auth/service.ts';
import { DEMO_PASSWORD, DEMO_STORES, DEMO_USERS, SEED_EPOCH } from './demo-data.ts';
import type { DemoStore, DemoUser } from './demo-data.ts';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** A database on this machine (the only kind that may be reset or get public demo secrets). */
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

export interface SeedRequest {
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string;
  reset: boolean;
  /** SEED_DEMO_PASSWORD: mandatory for a non-local database (e.g. the Vercel/Neon test env). */
  password: string | undefined;
}

export interface SeedPlan {
  reset: boolean;
  password: string;
  /** Pre-enrol OWNER/ADMIN with the documented TOTP secrets (local databases only). */
  preEnrolTwoFactor: boolean;
}

const refuse = (reason: string) =>
  new AppError('FORBIDDEN', `Seed refused: ${reason}`, { details: { reason } });

/**
 * Guard rails: never in production; reset only on a local database; the public demo password
 * and TOTP secrets only on a local database (a reachable test deployment would otherwise be
 * open to anyone reading the README).
 */
export function planSeed({ nodeEnv, databaseUrl, reset, password }: SeedRequest): SeedPlan {
  if (nodeEnv === 'production') throw refuse('NODE_ENV=production');
  const local = isLocalDatabaseUrl(databaseUrl);
  if (reset && !local) throw refuse('reset is only allowed on a local database');
  if (!local && password === undefined) {
    throw refuse('SEED_DEMO_PASSWORD is required for a non-local database');
  }
  const chosen = password ?? DEMO_PASSWORD;
  const violations = DEMO_USERS.flatMap((user) => checkPasswordPolicy(chosen, user.email));
  if (violations.length > 0)
    throw refuse(`password policy (${[...new Set(violations)].join(', ')})`);
  return { reset, password: chosen, preEnrolTwoFactor: local };
}

/** Empties every application table (local databases only — checked by `planSeed`). */
export async function resetDatabase(db: DbClient): Promise<void> {
  const tables = await db.$queryRaw<{ name: string }[]>`
    SELECT tablename AS name FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ name }) => `"${name.replaceAll('"', '""')}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

/** JSON with sorted keys: PostgreSQL `jsonb` does not keep key order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const sameJson = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

export interface SeedSummary {
  created: number;
  updated: number;
  unchanged: number;
}

export interface SeedDependencies {
  db: DbClient;
  secretBox: SecretBox;
}

/**
 * Applies the demo data. Idempotent: rows are found by their natural key (slug, hostname,
 * e-mail) and written only when they differ, so a second run changes nothing (not even
 * `updatedAt`). Data that is not part of the demo set is left untouched.
 */
export async function seedDemo(deps: SeedDependencies, plan: SeedPlan): Promise<SeedSummary> {
  if (plan.reset) await resetDatabase(deps.db);
  const summary: SeedSummary = { created: 0, updated: 0, unchanged: 0 };
  const count = (outcome: keyof SeedSummary) => {
    summary[outcome] += 1;
  };

  const storeIds = new Map<string, string>();
  for (const store of DEMO_STORES) {
    const { id, outcome } = await upsertStore(deps.db, store);
    storeIds.set(store.slug, id);
    count(outcome);
  }
  for (const user of DEMO_USERS) {
    count(await upsertUser(deps, plan, user, storeIds));
  }
  return summary;
}

type Outcome = 'created' | 'updated' | 'unchanged';

async function upsertStore(
  db: DbClient,
  demo: DemoStore,
): Promise<{ id: string; outcome: Outcome }> {
  const data = {
    name: demo.name,
    orderPrefix: demo.orderPrefix,
    defaultLocale: demo.defaultLocale,
    locales: demo.locales,
    theme: demo.theme,
    isActive: true,
  };
  const existing = await db.store.findUnique({ where: { slug: demo.slug } });
  let outcome: Outcome = 'unchanged';
  let id: string;
  if (existing === null) {
    id = (await db.store.create({ data: { slug: demo.slug, ...data } })).id;
    outcome = 'created';
  } else {
    id = existing.id;
    const differs =
      existing.name !== data.name ||
      existing.orderPrefix !== data.orderPrefix ||
      existing.defaultLocale !== data.defaultLocale ||
      !sameJson(existing.locales, data.locales) ||
      !sameJson(existing.theme, data.theme) ||
      !existing.isActive;
    if (differs) {
      await db.store.update({ where: { id }, data });
      outcome = 'updated';
    }
  }

  for (const [index, hostname] of demo.hostnames.entries()) {
    const isPrimary = index === 0;
    const domain = await db.storeDomain.findUnique({ where: { hostname } });
    if (domain === null) {
      await db.storeDomain.create({ data: { hostname, isPrimary, storeId: id } });
      if (outcome === 'unchanged') outcome = 'updated';
    } else if (domain.storeId !== id || domain.isPrimary !== isPrimary) {
      await db.storeDomain.update({ where: { hostname }, data: { storeId: id, isPrimary } });
      if (outcome === 'unchanged') outcome = 'updated';
    }
  }
  return { id, outcome };
}

async function upsertUser(
  { db, secretBox }: SeedDependencies,
  plan: SeedPlan,
  demo: DemoUser,
  storeIds: ReadonlyMap<string, string>,
): Promise<Outcome> {
  const wantedStores = demo.stores.map((slug) => {
    const id = storeIds.get(slug);
    if (id === undefined) throw new Error(`Unknown demo store ${slug}`);
    return id;
  });
  const fields = { name: demo.name, roles: demo.roles, locale: demo.locale, isActive: true };

  let outcome: Outcome = 'unchanged';
  let user = await db.user.findUnique({
    where: { email: demo.email },
    include: { storeAccess: true, totpSecret: true },
  });
  if (user === null) {
    await db.user.create({
      data: {
        email: demo.email,
        ...fields,
        passwordHash: await hashPassword(plan.password),
        storeAccess: { create: wantedStores.map((storeId) => ({ storeId })) },
      },
    });
    user = await db.user.findUniqueOrThrow({
      where: { email: demo.email },
      include: { storeAccess: true, totpSecret: true },
    });
    outcome = 'created';
  } else {
    const differs =
      user.name !== fields.name ||
      user.locale !== fields.locale ||
      !user.isActive ||
      !sameJson([...user.roles].sort(), [...fields.roles].sort());
    const passwordMatches = await verifyPassword(user.passwordHash, plan.password);
    if (differs || !passwordMatches) {
      await db.user.update({
        where: { id: user.id },
        data: {
          ...fields,
          ...(passwordMatches ? {} : { passwordHash: await hashPassword(plan.password) }),
        },
      });
      outcome = 'updated';
    }
    const current = new Set(user.storeAccess.map((access) => access.storeId));
    const wanted = new Set(wantedStores);
    const extra = [...current].filter((storeId) => !wanted.has(storeId));
    const missing = wantedStores.filter((storeId) => !current.has(storeId));
    if (extra.length > 0 || missing.length > 0) {
      const userId = user.id;
      await db.userStoreAccess.deleteMany({ where: { userId, storeId: { in: extra } } });
      await db.userStoreAccess.createMany({
        data: missing.map((storeId) => ({ userId, storeId })),
      });
      outcome = 'updated';
    }
  }

  if (plan.preEnrolTwoFactor && demo.totpSecret !== undefined) {
    const context = totpContext(user.id);
    let enrolled = false;
    if (user.totpSecret !== null && user.totpEnabledAt !== null) {
      try {
        enrolled = secretBox.decrypt(user.totpSecret, { context }) === demo.totpSecret;
      } catch {
        enrolled = false;
      }
    }
    if (!enrolled) {
      const sealed = secretBox.encrypt(demo.totpSecret, { context });
      const secret = {
        kind: 'TOTP_SECRET' as const,
        ciphertext: Buffer.from(sealed.ciphertext),
        iv: Buffer.from(sealed.iv),
        authTag: Buffer.from(sealed.authTag),
        keyVersion: sealed.keyVersion,
        last4: null,
      };
      await db.user.update({
        where: { id: user.id },
        data: {
          totpEnabledAt: SEED_EPOCH,
          totpLastUsedStep: null,
          recoveryCodes: [],
          totpSecret: user.totpSecretId === null ? { create: secret } : { update: secret },
        },
      });
      if (outcome === 'unchanged') outcome = 'updated';
    }
  }
  return outcome;
}
