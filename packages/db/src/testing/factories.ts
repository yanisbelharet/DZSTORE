import type { DbExecutor } from '../client.ts';
import type { Locale, Prisma, Role, Store, User } from '../generated/prisma/client.ts';

/**
 * Password hash that no password matches (not a valid Argon2 string). Tests that need to log in
 * pass a real hash (hashing belongs to the API, not to this package).
 */
export const UNUSABLE_PASSWORD_HASH = '!unusable-test-password-hash';

export interface StoreOverrides {
  slug?: string;
  name?: string;
  orderPrefix?: string;
  defaultLocale?: Locale;
  locales?: Locale[];
  theme?: Prisma.InputJsonValue;
  isActive?: boolean;
  /** Hostnames of the store; the first one is primary. Default: `<slug>.localhost`. */
  hostnames?: string[];
}

export interface UserOverrides {
  email?: string;
  name?: string;
  roles?: Role[];
  passwordHash?: string;
  locale?: Locale;
  isActive?: boolean;
  /** Stores the user may access (agents). */
  storeIds?: string[];
}

export interface Factories {
  store(overrides?: StoreOverrides): Promise<Store>;
  user(overrides?: UserOverrides): Promise<User>;
}

/**
 * Deterministic test data builders: every call gets the next sequence number, so values are
 * unique within a test database and identical from one run to the next.
 */
export function createFactories(db: DbExecutor): Factories {
  let sequence = 0;
  const next = () => {
    sequence += 1;
    return sequence;
  };

  return {
    async store(overrides = {}) {
      const n = next();
      const slug = overrides.slug ?? `boutique-${String(n)}`;
      const hostnames = overrides.hostnames ?? [`${slug}.localhost`];
      return db.store.create({
        data: {
          slug,
          name: overrides.name ?? `Boutique ${String(n)}`,
          orderPrefix: overrides.orderPrefix ?? `T${String(n)}`,
          defaultLocale: overrides.defaultLocale ?? 'ar',
          locales: overrides.locales ?? ['ar', 'fr'],
          theme: overrides.theme ?? {},
          isActive: overrides.isActive ?? true,
          domains: {
            create: hostnames.map((hostname, index) => ({ hostname, isPrimary: index === 0 })),
          },
        },
      });
    },

    async user(overrides = {}) {
      const n = next();
      return db.user.create({
        data: {
          email: overrides.email ?? `user${String(n)}@factory.test`,
          name: overrides.name ?? `Utilisateur ${String(n)}`,
          roles: overrides.roles ?? ['CONFIRMATION_AGENT'],
          passwordHash: overrides.passwordHash ?? UNUSABLE_PASSWORD_HASH,
          locale: overrides.locale ?? 'fr',
          isActive: overrides.isActive ?? true,
          storeAccess: { create: (overrides.storeIds ?? []).map((storeId) => ({ storeId })) },
        },
      });
    },
  };
}
