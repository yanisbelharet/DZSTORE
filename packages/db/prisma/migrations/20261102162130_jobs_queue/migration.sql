-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'DEAD', 'CANCELLED');

-- CreateTable
CREATE TABLE "Job" (
    "id" BIGSERIAL NOT NULL,
    "queue" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "concurrencyKey" TEXT,
    "dedupeKey" TEXT,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "name" TEXT NOT NULL,
    "intervalSeconds" INTEGER NOT NULL,
    "nextRunAt" TIMESTAMPTZ(3) NOT NULL,
    "lastRunAt" TIMESTAMPTZ(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "Job_status_runAt_priority_idx" ON "Job"("status", "runAt", "priority");

-- CreateIndex
CREATE INDEX "Job_status_lockedUntil_idx" ON "Job"("status", "lockedUntil");

-- CreateIndex
CREATE INDEX "Job_concurrencyKey_status_idx" ON "Job"("concurrencyKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Job_queue_dedupeKey_key" ON "Job"("queue", "dedupeKey");

-- Un seul job en cours par clé de concurrence (ADR-0023).
CREATE UNIQUE INDEX "Job_one_running_per_concurrency_key" ON "Job"("concurrencyKey")
  WHERE "status" = 'RUNNING' AND "concurrencyKey" IS NOT NULL;

ALTER TABLE "Job" ADD CONSTRAINT "Job_attempts_valid" CHECK ("attempts" >= 0 AND "maxAttempts" >= 1);
ALTER TABLE "ScheduledTask" ADD CONSTRAINT "ScheduledTask_interval_positive" CHECK ("intervalSeconds" > 0);
