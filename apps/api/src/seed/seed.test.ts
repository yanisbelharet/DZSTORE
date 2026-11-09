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
      storeHosts: new Map(),
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
    ).toEqual({
      reset: false,
      password: 'Un mot de passe solide',
      preEnrolTwoFactor: false,
      storeHosts: new Map(),
    });
  });

  it('déploiement de test marqué (DEPLOYMENT_ENVIRONMENT=test) : autorisé malgré NODE_ENV=production', () => {
    const request = {
      nodeEnv: 'production',
      databaseUrl: REMOTE,
      reset: false,
      password: 'Un mot de passe solide',
    } as const;
    expect(() => planSeed({ ...request, deploymentEnvironment: 'production' })).toThrow(
      /NODE_ENV=production/u,
    );
    expect(planSeed({ ...request, deploymentEnvironment: 'test' }).preEnrolTwoFactor).toBe(false);
    // The marker never unlocks a reset of a remote database.
    expect(() => planSeed({ ...request, deploymentEnvironment: 'test', reset: true })).toThrow(
      /reset/u,
    );
  });

  it('domaines publics des boutiques de démo (SEED_STORE_HOSTS)', () => {
    const plan = planSeed({
      nodeEnv: 'test',
      databaseUrl: LOCAL,
      reset: false,
      password: undefined,
      storeHosts: ' demo-beaute=dzstore-beaute.vercel.app , demo-maison=dzstore-maison.vercel.app ',
    });
    expect([...plan.storeHosts]).toEqual([
      ['demo-beaute', 'dzstore-beaute.vercel.app'],
      ['demo-maison', 'dzstore-maison.vercel.app'],
    ]);
    for (const invalid of [
      'inconnue=x.vercel.app',
      'demo-beaute',
      'demo-beaute=Pas Un Hote',
      'demo-beaute=a.dz:443',
    ]) {
      expect(() =>
        planSeed({
          nodeEnv: 'test',
          databaseUrl: LOCAL,
          reset: false,
          password: undefined,
          storeHosts: invalid,
        }),
      ).toThrow(/SEED_STORE_HOSTS/u);
    }
  });

  it('le mot de passe choisi respecte la politique des comptes', () => {
    expect(() =>
      planSeed({ nodeEnv: 'test', databaseUrl: REMOTE, reset: false, password: 'court' }),
    ).toThrow(/password policy \(TOO_SHORT\)/u);
  });
});
