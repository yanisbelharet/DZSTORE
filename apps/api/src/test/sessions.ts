import { systemClock } from '@dz/core';
import type { DbClient, Role } from '@dz/db';

import { createSession } from '../modules/auth/sessions.ts';
import { CSRF } from './helpers.ts';

let sequence = 0;

/** Creates a user with a fully verified web session; returns ready-to-use request headers. */
export async function signedInAs(
  db: DbClient,
  roles: Role[],
  { storeIds = [] as string[], email }: { storeIds?: string[]; email?: string } = {},
) {
  sequence += 1;
  const user = await db.user.create({
    data: {
      email:
        email ??
        `${roles.join('-').toLowerCase()}-${String(sequence)}-${String(Date.now())}@dz.test`,
      name: `Test ${roles.join(' ')}`,
      passwordHash: 'not-used',
      roles,
      storeAccess: { create: storeIds.map((storeId) => ({ storeId })) },
    },
  });
  const { token } = await createSession(db, systemClock, {
    userId: user.id,
    kind: 'WEB',
    remembered: false,
    twoFactorVerified: true,
    ip: undefined,
    userAgent: undefined,
  });
  return { user, token, headers: { ...CSRF, cookie: `__Host-dz_session=${token}` } };
}
