import type { DbClient } from '@dz/db';
import { COMMUNES, WILAYAS } from '@dz/geo';

export interface GeoSyncSummary {
  wilayas: { created: number; updated: number };
  communes: { created: number; updated: number; deactivated: number };
}

/**
 * Synchronises the reference data of @dz/geo into the database. Idempotent (rows written only
 * when they differ) and never destructive: a commune removed from the reference is deactivated,
 * not deleted (orders reference it). Reference data: allowed in every environment.
 */
export async function syncGeoReference(db: DbClient): Promise<GeoSyncSummary> {
  const summary: GeoSyncSummary = {
    wilayas: { created: 0, updated: 0 },
    communes: { created: 0, updated: 0, deactivated: 0 },
  };
  await db.$transaction(
    async (tx) => {
      const wilayas = new Map((await tx.wilaya.findMany()).map((w) => [w.id, w]));
      for (const w of WILAYAS) {
        const data = { nameAr: w.nameAr, nameFr: w.nameFr, nameAscii: w.nameAscii, isActive: true };
        const existing = wilayas.get(w.code);
        if (!existing) {
          await tx.wilaya.create({ data: { id: w.code, ...data } });
          summary.wilayas.created += 1;
        } else if (
          existing.nameAr !== data.nameAr ||
          existing.nameFr !== data.nameFr ||
          existing.nameAscii !== data.nameAscii ||
          !existing.isActive
        ) {
          await tx.wilaya.update({ where: { id: w.code }, data });
          summary.wilayas.updated += 1;
        }
      }

      const communes = new Map((await tx.commune.findMany()).map((c) => [c.id, c]));
      const missing = COMMUNES.filter((c) => !communes.has(c.id));
      if (missing.length > 0) {
        await tx.commune.createMany({
          data: missing.map((c) => ({
            id: c.id,
            wilayaId: c.wilayaCode,
            nameAr: c.nameAr,
            nameFr: c.nameFr,
            nameAscii: c.nameAscii,
          })),
        });
        summary.communes.created = missing.length;
      }
      for (const c of COMMUNES) {
        const existing = communes.get(c.id);
        if (!existing) continue;
        if (
          existing.wilayaId !== c.wilayaCode ||
          existing.nameAr !== c.nameAr ||
          existing.nameFr !== c.nameFr ||
          existing.nameAscii !== c.nameAscii ||
          !existing.isActive
        ) {
          await tx.commune.update({
            where: { id: c.id },
            data: {
              wilayaId: c.wilayaCode,
              nameAr: c.nameAr,
              nameFr: c.nameFr,
              nameAscii: c.nameAscii,
              isActive: true,
            },
          });
          summary.communes.updated += 1;
        }
      }
      const known = new Set(COMMUNES.map((c) => c.id));
      const removed = [...communes.values()].filter((c) => c.isActive && !known.has(c.id));
      if (removed.length > 0) {
        await tx.commune.updateMany({
          where: { id: { in: removed.map((c) => c.id) } },
          data: { isActive: false },
        });
        summary.communes.deactivated = removed.length;
      }
    },
    { timeout: 60_000 },
  );
  return summary;
}
