// Synchronises the geographic reference (69 wilayas, 1541 communes, @dz/geo) into the database.
// Usage: pnpm db:geo — idempotent, non-destructive, allowed in every environment.
import { createDbClient } from '@dz/db';

import { syncGeoReference } from '../modules/geo/sync.ts';

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (url === undefined || !/^postgres(ql)?:\/\//u.test(url)) {
  process.stderr.write('sync-geo: DATABASE_URL is required.\n');
  process.exit(2);
}
const db = createDbClient({ url, maxConnections: 2 });
try {
  const { wilayas, communes } = await syncGeoReference(db);
  process.stdout.write(
    `Geo reference: wilayas +${String(wilayas.created)} ~${String(wilayas.updated)}, ` +
      `communes +${String(communes.created)} ~${String(communes.updated)} ` +
      `-${String(communes.deactivated)} (deactivated).\n`,
  );
} finally {
  await db.$disconnect();
}
