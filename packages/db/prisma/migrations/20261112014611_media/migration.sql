-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Media" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "alt" JSONB,
    "variants" JSONB NOT NULL DEFAULT '[]',
    "status" "MediaStatus" NOT NULL DEFAULT 'PROCESSING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Media_storageKey_key" ON "Media"("storageKey");

-- CreateIndex
CREATE INDEX "Media_storeId_createdAt_id_idx" ON "Media"("storeId", "createdAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Non exprimable en Prisma (ARCHITECTURE §3).
ALTER TABLE "Media" ADD CONSTRAINT "Media_dimensions_check" CHECK ("width" > 0 AND "height" > 0 AND "bytes" > 0);
ALTER TABLE "Media" ADD CONSTRAINT "Media_variants_array_check" CHECK (jsonb_typeof("variants") = 'array');
