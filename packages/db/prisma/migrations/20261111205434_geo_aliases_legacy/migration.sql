-- CreateEnum
CREATE TYPE "GeoAliasKind" AS ENUM ('FORMER_NAME', 'VARIANT');

-- AlterTable : colonne remplie d'abord (lignes existantes), puis rendue obligatoire.
ALTER TABLE "Commune" ADD COLUMN "legacyWilayaId" INTEGER,
ADD COLUMN "toVerify" TEXT;
-- Wilayas 59–69 (loi 26-06, décret 26-206) → wilaya d'origine dans le modèle à 58.
UPDATE "Commune" SET "legacyWilayaId" = CASE "wilayaId"
  WHEN 59 THEN 3 WHEN 60 THEN 5 WHEN 61 THEN 7 WHEN 62 THEN 12 WHEN 63 THEN 13 WHEN 64 THEN 14
  WHEN 65 THEN 17 WHEN 66 THEN 17 WHEN 67 THEN 26 WHEN 68 THEN 28 WHEN 69 THEN 32
  ELSE "wilayaId" END;
ALTER TABLE "Commune" ALTER COLUMN "legacyWilayaId" SET NOT NULL;

-- CreateTable
CREATE TABLE "GeoAlias" (
    "id" SERIAL NOT NULL,
    "communeId" INTEGER NOT NULL,
    "lang" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "kind" "GeoAliasKind" NOT NULL,

    CONSTRAINT "GeoAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeoAlias_nameKey_idx" ON "GeoAlias"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "GeoAlias_communeId_lang_nameKey_key" ON "GeoAlias"("communeId", "lang", "nameKey");

-- CreateIndex
CREATE INDEX "Commune_legacyWilayaId_idx" ON "Commune"("legacyWilayaId");

-- AddForeignKey
ALTER TABLE "GeoAlias" ADD CONSTRAINT "GeoAlias_communeId_fkey" FOREIGN KEY ("communeId") REFERENCES "Commune"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Non exprimable en Prisma (ARCHITECTURE §3).
ALTER TABLE "Commune" ADD CONSTRAINT "Commune_legacyWilayaId_check" CHECK ("legacyWilayaId" BETWEEN 1 AND 58);
ALTER TABLE "GeoAlias" ADD CONSTRAINT "GeoAlias_lang_check" CHECK ("lang" IN ('ar', 'fr'));
