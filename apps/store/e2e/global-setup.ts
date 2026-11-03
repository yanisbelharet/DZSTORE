import { createDbClient } from '@dz/db';
import { recreateDatabase } from '@dz/db/testing';

import { E2E_DATABASE } from '../playwright.config.ts';
import { INACTIVE_HOST, STORE_A, STORE_B } from './fixtures.ts';

/** Fresh migrated database with two active stores (distinct hosts, languages, themes). */
export default async function globalSetup(): Promise<void> {
  const db = createDbClient({ url: await recreateDatabase(E2E_DATABASE) });
  try {
    await db.store.create({
      data: {
        slug: STORE_A.slug,
        name: STORE_A.name,
        orderPrefix: 'AL',
        defaultLocale: 'ar',
        locales: ['ar', 'fr'],
        theme: { colors: { primary: STORE_A.primary } },
        domains: { create: [{ hostname: STORE_A.host, isPrimary: true }] },
      },
    });
    await db.store.create({
      data: {
        slug: STORE_B.slug,
        name: STORE_B.name,
        orderPrefix: 'BE',
        defaultLocale: 'fr',
        locales: ['fr', 'ar'],
        theme: { colors: { primary: STORE_B.primary }, radius: 'lg' },
        domains: { create: [{ hostname: STORE_B.host, isPrimary: true }] },
      },
    });
    await db.store.create({
      data: {
        slug: 'fermee',
        name: 'Boutique fermée',
        orderPrefix: 'FE',
        isActive: false,
        domains: { create: [{ hostname: INACTIVE_HOST, isPrimary: true }] },
      },
    });
  } finally {
    await db.$disconnect();
  }
}
