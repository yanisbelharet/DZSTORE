import { createDbClient } from '@dz/db';
import { createFactories, recreateDatabase } from '@dz/db/testing';

import { E2E_DATABASE } from '../playwright.config.ts';
import { INACTIVE_HOST, STORE_A, STORE_B } from './fixtures.ts';

/** Fresh migrated database with two active stores (distinct hosts, languages, themes). */
export default async function globalSetup(): Promise<void> {
  const db = createDbClient({ url: await recreateDatabase(E2E_DATABASE) });
  try {
    const make = createFactories(db);
    await make.store({
      slug: STORE_A.slug,
      name: STORE_A.name,
      defaultLocale: 'ar',
      locales: ['ar', 'fr'],
      theme: { colors: { primary: STORE_A.primary } },
      hostnames: [STORE_A.host],
    });
    await make.store({
      slug: STORE_B.slug,
      name: STORE_B.name,
      defaultLocale: 'fr',
      locales: ['fr', 'ar'],
      theme: { colors: { primary: STORE_B.primary }, radius: 'lg' },
      hostnames: [STORE_B.host],
    });
    await make.store({
      slug: 'fermee',
      name: 'Boutique fermée',
      isActive: false,
      hostnames: [INACTIVE_HOST],
    });
  } finally {
    await db.$disconnect();
  }
}
