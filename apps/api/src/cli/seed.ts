// Demo data for a local (or test) database — idempotent, refused in production.
// Usage: pnpm db:seed            (apply / repair the demo data)
//        pnpm db:seed --reset    (empty every table first — local database only)
// A non-local database (Neon test environment) requires SEED_DEMO_PASSWORD and gets no
// pre-enrolled two-factor secret; SEED_STORE_HOSTS adds the public demo domains. Allowed with
// NODE_ENV=production only when DEPLOYMENT_ENVIRONMENT=test (ADR-0025).
// Accounts and local credentials: README « Données de démo ».
import { parseArgs } from 'node:util';

import { createSecretBox, parseEncryptionKeys } from '@dz/core/crypto';
import { AppError } from '@dz/core/errors';
import { createDbClient } from '@dz/db';
import { z } from 'zod';

import { planSeed, seedDemo } from '../seed/seed.ts';

const { values } = parseArgs({ options: { reset: { type: 'boolean', default: false } } });
const env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DEPLOYMENT_ENVIRONMENT: z.string().optional(),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//u),
    /** Direct (non-pooled) connection when available — Neon's Vercel integration sets it. */
    DATABASE_URL_UNPOOLED: z
      .string()
      .regex(/^postgres(ql)?:\/\//u)
      .optional(),
    APP_ENCRYPTION_KEYS: z.string().min(1).optional(),
    SEED_DEMO_PASSWORD: z.string().min(1).optional(),
    SEED_STORE_HOSTS: z.string().optional(),
  })
  .safeParse(process.env);
if (!env.success) {
  process.stderr.write('Seed: DATABASE_URL is required (see .env.example).\n');
  process.exit(2);
}

const databaseUrl = env.data.DATABASE_URL_UNPOOLED ?? env.data.DATABASE_URL;
let plan;
try {
  plan = planSeed({
    nodeEnv: env.data.NODE_ENV,
    deploymentEnvironment: env.data.DEPLOYMENT_ENVIRONMENT,
    databaseUrl,
    reset: values.reset,
    password: env.data.SEED_DEMO_PASSWORD,
    storeHosts: env.data.SEED_STORE_HOSTS,
  });
} catch (error) {
  process.stderr.write(`${error instanceof AppError ? error.message : String(error)}\n`);
  process.exit(2);
}

const keys = env.data.APP_ENCRYPTION_KEYS;
if (plan.preEnrolTwoFactor && keys === undefined) {
  process.stderr.write('Seed: APP_ENCRYPTION_KEYS is required on a local database (2FA).\n');
  process.exit(2);
}
const db = createDbClient({ url: databaseUrl, maxConnections: 2 });
try {
  const secretBox = keys === undefined ? undefined : createSecretBox(parseEncryptionKeys(keys));
  const summary = await seedDemo({ db, ...(secretBox ? { secretBox } : {}) }, plan);
  process.stdout.write(
    `Seed ${plan.reset ? 'after reset ' : ''}done: ${String(summary.created)} created, ` +
      `${String(summary.updated)} updated, ${String(summary.unchanged)} unchanged.\n` +
      (plan.preEnrolTwoFactor
        ? 'Local demo accounts: see README (« Données de démo »).\n'
        : 'Two-factor authentication: OWNER/ADMIN enrol at first login.\n'),
  );
} finally {
  await db.$disconnect();
}
