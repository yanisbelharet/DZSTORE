// Demo data for a local (or test) database — idempotent, refused in production.
// Usage: pnpm db:seed            (apply / repair the demo data)
//        pnpm db:seed --reset    (empty every table first — local database only)
// A non-local database (Neon test environment) requires SEED_DEMO_PASSWORD and gets no
// pre-enrolled two-factor secret. Accounts and local credentials: README « Données de démo ».
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
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//u),
    APP_ENCRYPTION_KEYS: z.string().min(1),
    SEED_DEMO_PASSWORD: z.string().min(1).optional(),
  })
  .safeParse(process.env);
if (!env.success) {
  process.stderr.write(
    'Seed: DATABASE_URL and APP_ENCRYPTION_KEYS are required (see .env.example).\n',
  );
  process.exit(2);
}

let plan;
try {
  plan = planSeed({
    nodeEnv: env.data.NODE_ENV,
    databaseUrl: env.data.DATABASE_URL,
    reset: values.reset,
    password: env.data.SEED_DEMO_PASSWORD,
  });
} catch (error) {
  process.stderr.write(`${error instanceof AppError ? error.message : String(error)}\n`);
  process.exit(2);
}

const db = createDbClient({ url: env.data.DATABASE_URL, maxConnections: 2 });
try {
  const secretBox = createSecretBox(parseEncryptionKeys(env.data.APP_ENCRYPTION_KEYS));
  const summary = await seedDemo({ db, secretBox }, plan);
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
