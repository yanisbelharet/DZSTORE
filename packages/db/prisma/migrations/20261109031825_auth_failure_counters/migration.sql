-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedTwoFactorCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFailedLoginAt" TIMESTAMPTZ(3);

-- Non exprimable en Prisma (ARCHITECTURE §3) : compteurs jamais négatifs.
ALTER TABLE "User" ADD CONSTRAINT "User_failedTwoFactorCount_check" CHECK ("failedTwoFactorCount" >= 0);
