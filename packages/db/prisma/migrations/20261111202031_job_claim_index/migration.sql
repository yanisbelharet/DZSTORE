-- Non exprimable en Prisma (ARCHITECTURE §3) : index partiel servant la prise du prochain job
-- (ORDER BY priority DESC, "runAt", id parmi les jobs PENDING), sans trier tout l'arriéré.
CREATE INDEX "Job_claim_idx" ON "Job" ("priority" DESC, "runAt", "id") WHERE "status" = 'PENDING';
