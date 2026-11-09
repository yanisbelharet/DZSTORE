// Build command of the API project on Vercel (test environment, ADR-0025):
// 1. apply migrations over the direct (non-pooled) Neon connection;
// 2. apply the demo seed when SEED_ON_DEPLOY=true (idempotent, guarded by planSeed);
// 3. bundle the serverless entry point.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const apiRoot = path.resolve(import.meta.dirname, '..');
const run = (command: string, args: string[]) => {
  process.stdout.write(`\n> ${command} ${args.join(' ')}\n`);
  execFileSync(command, args, { cwd: apiRoot, stdio: 'inherit', env: process.env });
};

if (process.env.DATABASE_URL === undefined && process.env.DATABASE_URL_UNPOOLED === undefined) {
  process.stderr.write('vercel-build: DATABASE_URL (or DATABASE_URL_UNPOOLED) is required.\n');
  process.exit(1);
}
run('pnpm', ['--filter', '@dz/db', 'migrate:deploy']);
if (process.env.SEED_ON_DEPLOY === 'true') run('node', ['src/cli/seed.ts']);
run('node', ['scripts/bundle-vercel.ts']);
