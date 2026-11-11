import type { DbClient } from '@dz/db';
import { COMMUNES, WILAYAS, matchKey } from '@dz/geo';

export interface GeoSyncSummary {
  wilayas: { created: number; updated: number };
  communes: { created: number; updated: number; deactivated: number };
  aliases: { created: number; deleted: number };
}

/**
 * Synchronises the reference data of @dz/geo into the database. Idempotent (rows written only
 * when they differ) and never destructive: a commune removed from the reference is deactivated,
 * not deleted (orders reference it). Aliases (former names, variants) mirror the reference. Reference data: allowed in every environment.
 */
export async function syncGeoReference(db: DbClient): Promise<GeoSyncSummary> {
  const summary: GeoSyncSummary = {
    wilayas: { created: 0, updated: 0 },
    communes: { created: 0, updated: 0, deactivated: 0 },
    aliases: { created: 0, deleted: 0 },
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
            legacyWilayaId: c.legacyWilayaCode,
            nameAr: c.nameAr,
            nameFr: c.nameFr,
            nameAscii: c.nameAscii,
            toVerify: c.toVerify,
          })),
        });
        summary.communes.created = missing.length;
      }
      for (const c of COMMUNES) {
        const existing = communes.get(c.id);
        if (!existing) continue;
        if (
          existing.wilayaId !== c.wilayaCode ||
          existing.legacyWilayaId !== c.legacyWilayaCode ||
          existing.toVerify !== c.toVerify ||
          existing.nameAr !== c.nameAr ||
          existing.nameFr !== c.nameFr ||
          existing.nameAscii !== c.nameAscii ||
          !existing.isActive
        ) {
          await tx.commune.update({
            where: { id: c.id },
            data: {
              wilayaId: c.wilayaCode,
              legacyWilayaId: c.legacyWilayaCode,
              nameAr: c.nameAr,
              nameFr: c.nameFr,
              nameAscii: c.nameAscii,
              toVerify: c.toVerify,
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

      // Aliases are pure reference data (nothing points to them): exact mirror of @dz/geo.
      const wanted = new Map<
        string,
        {
          communeId: number;
          lang: string;
          name: string;
          nameKey: string;
          kind: 'FORMER_NAME' | 'VARIANT';
        }
      >();
      for (const c of COMMUNES) {
        for (const alias of c.aliases) {
          const nameKey = matchKey(alias.name);
          const key = `${String(c.id)}|${alias.lang}|${nameKey}`;
          if (!wanted.has(key))
            wanted.set(key, {
              communeId: c.id,
              lang: alias.lang,
              name: alias.name,
              nameKey,
              kind: alias.kind,
            });
        }
      }
      const stale: number[] = [];
      for (const row of await tx.geoAlias.findMany()) {
        const key = `${String(row.communeId)}|${row.lang}|${row.nameKey}`;
        const target = wanted.get(key);
        if (target?.name === row.name && target.kind === row.kind) wanted.delete(key);
        else stale.push(row.id);
      }
      if (stale.length > 0) {
        await tx.geoAlias.deleteMany({ where: { id: { in: stale } } });
        summary.aliases.deleted = stale.length;
      }
      if (wanted.size > 0) {
        await tx.geoAlias.createMany({ data: [...wanted.values()] });
        summary.aliases.created = wanted.size;
      }
    },
    { timeout: 60_000 },
  );
  return summary;
}
