import { describe, expect, it } from 'vitest';

import { DEMO_PASSWORD } from './demo-data.ts';
import { isLocalDatabaseUrl, planSeed } from './seed.ts';

const LOCAL = 'postgresql://dz:dz@localhost:5432/dz_dev';
const REMOTE = 'postgresql://user:pw@ep-demo-123.eu-central-1.aws.neon.tech/neondb?sslmode=require';

describe('garde-fous du seed', () => {
  it('reconnaît une base locale', () => {
    expect(isLocalDatabaseUrl(LOCAL)).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://dz:dz@127.0.0.1/dz_dev')).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://dz:dz@[::1]:5432/dz_dev')).toBe(true);
    expect(isLocalDatabaseUrl(REMOTE)).toBe(false);
    expect(isLocalDatabaseUrl('pas une url')).toBe(false);
  });

  it('refuse toujours en production, même en local', () => {
    expect(() =>
      planSeed({ nodeEnv: 'production', databaseUrl: LOCAL, reset: false, password: undefined }),
    ).toThrow(/NODE_ENV=production/u);
  });

  it('base locale : mot de passe et 2FA de démo documentés, réinitialisation possible', () => {
    expect(
      planSeed({ nodeEnv: 'development', databaseUrl: LOCAL, reset: true, password: undefined }),
    ).toEqual({
      reset: true,
      password: DEMO_PASSWORD,
      preEnrolTwoFactor: true,
    });
  });

  it('base distante : jamais de réinitialisation ni de secrets publics', () => {
    expect(() =>
      planSeed({
        nodeEnv: 'development',
        databaseUrl: REMOTE,
        reset: true,
        password: 'x'.repeat(20),
      }),
    ).toThrow(/reset is only allowed on a local database/u);
    expect(() =>
      planSeed({ nodeEnv: 'development', databaseUrl: REMOTE, reset: false, password: undefined }),
    ).toThrow(/SEED_DEMO_PASSWORD is required/u);
    expect(
      planSeed({
        nodeEnv: 'development',
        databaseUrl: REMOTE,
        reset: false,
        password: 'Un mot de passe solide',
      }),
    ).toEqual({ reset: false, password: 'Un mot de passe solide', preEnrolTwoFactor: false });
  });

  it('le mot de passe choisi respecte la politique des comptes', () => {
    expect(() =>
      planSeed({ nodeEnv: 'test', databaseUrl: REMOTE, reset: false, password: 'court' }),
    ).toThrow(/password policy \(TOO_SHORT\)/u);
  });
});
