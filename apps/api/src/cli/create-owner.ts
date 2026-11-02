// Creates the first OWNER account (no public sign-up exists).
// Usage: pnpm --filter @dz/api create-owner --email owner@example.com --name "Prénom Nom"
// Password: OWNER_PASSWORD from the environment, otherwise a strong random one printed once.
// Two-factor enrolment is required at first login.
import { parseArgs } from 'node:util';

import { randomToken } from '@dz/core/crypto';
import { createDbClient } from '@dz/db';
import { z } from 'zod';

import { recordAudit } from '../modules/audit/audit.ts';
import { checkPasswordPolicy, hashPassword } from '../modules/auth/password.ts';

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' } },
});
const input = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    name: z.string().trim().min(2).max(100),
    databaseUrl: z.string().regex(/^postgres(ql)?:\/\//u),
  })
  .safeParse({ ...values, databaseUrl: process.env.DATABASE_URL });
if (!input.success) {
  process.stderr.write(
    'Usage: create-owner --email <e-mail> --name "<name>" (DATABASE_URL required)\n',
  );
  process.exit(2);
}

const generated = process.env.OWNER_PASSWORD === undefined;
const password = process.env.OWNER_PASSWORD ?? randomToken(18);
const violations = checkPasswordPolicy(password, input.data.email);
if (violations.length > 0) {
  process.stderr.write(`OWNER_PASSWORD rejected: ${violations.join(', ')}\n`);
  process.exit(2);
}

const db = createDbClient({ url: input.data.databaseUrl, maxConnections: 1 });
try {
  if (await db.user.findUnique({ where: { email: input.data.email } })) {
    process.stderr.write('An account already uses this e-mail.\n');
    process.exit(1);
  }
  const owner = await db.user.create({
    data: {
      email: input.data.email,
      name: input.data.name,
      roles: ['OWNER'],
      passwordHash: await hashPassword(password),
    },
  });
  await recordAudit(db, {
    actorType: 'SYSTEM',
    action: 'user.created',
    entityType: 'User',
    entityId: owner.id,
    after: { roles: ['OWNER'], via: 'cli' },
  });
  process.stdout.write(`OWNER created: ${owner.email}\n`);
  if (generated) process.stdout.write(`Temporary password (shown once): ${password}\n`);
  process.stdout.write('Two-factor enrolment will be required at first login.\n');
} finally {
  await db.$disconnect();
}
