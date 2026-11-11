-- CreateTable
CREATE TABLE "Wilaya" (
    "id" INTEGER NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameAscii" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Wilaya_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commune" (
    "id" INTEGER NOT NULL,
    "wilayaId" INTEGER NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameAscii" TEXT NOT NULL,
    "postalCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Commune_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Commune_wilayaId_idx" ON "Commune"("wilayaId");

-- CreateIndex
CREATE UNIQUE INDEX "Commune_wilayaId_nameAscii_key" ON "Commune"("wilayaId", "nameAscii");

-- AddForeignKey
ALTER TABLE "Commune" ADD CONSTRAINT "Commune_wilayaId_fkey" FOREIGN KEY ("wilayaId") REFERENCES "Wilaya"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Non exprimable en Prisma (ARCHITECTURE §3) : codes de wilaya et identifiants positifs.
ALTER TABLE "Wilaya" ADD CONSTRAINT "Wilaya_id_check" CHECK ("id" BETWEEN 1 AND 99);
ALTER TABLE "Commune" ADD CONSTRAINT "Commune_id_check" CHECK ("id" > 0);
