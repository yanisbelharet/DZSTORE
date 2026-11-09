import { existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'prisma/config';

// Prisma 7 no longer loads `.env`: load the repository root `.env` when present (Node built-in).
// Variables already set in the environment (CI, production) take precedence.
const rootEnvFile = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Migrations need a direct connection: Neon's pooler (PgBouncer, transaction mode) is only
  // for the application (ADR-0025). Locally, DATABASE_URL is already direct.
  datasource: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '' },
});
