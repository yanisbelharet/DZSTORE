import { AppError } from '@dz/core/errors';
import { describe, expect, it } from 'vitest';

import { loadApiConfig } from './config.ts';

const base = {
  DATABASE_URL: 'postgresql://dz:dz@localhost:5432/dz_dev',
  APP_ENCRYPTION_KEYS: `1:${Buffer.alloc(32, 7).toString('base64')}`,
};

describe('configuration de l’API', () => {
  it('valeurs par défaut sûres', () => {
    const config = loadApiConfig(base);
    expect(config).toMatchObject({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 3000,
      corsOrigins: [],
      bodyLimitBytes: 262_144,
      trustProxy: false,
      docsEnabled: true,
      cookieSecure: true,
    });
    expect(config.encryptionKeys.size).toBe(1);
  });

  it('lit la liste CORS, le port et la confiance proxy', () => {
    const config = loadApiConfig({
      ...base,
      PORT: '8080',
      CORS_ORIGINS: 'https://admin.dz.example, https://beaute.dz.example',
      TRUST_PROXY: 'true',
    });
    expect(config.port).toBe(8080);
    expect(config.corsOrigins).toEqual(['https://admin.dz.example', 'https://beaute.dz.example']);
    expect(config.trustProxy).toBe(true);
  });

  it('documentation désactivée en production', () => {
    expect(loadApiConfig({ ...base, NODE_ENV: 'production' }).docsEnabled).toBe(false);
  });

  it('refuse une configuration invalide', () => {
    expect(() => loadApiConfig({})).toThrow(AppError);
    expect(() => loadApiConfig({ ...base, PORT: '70000' })).toThrow(AppError);
    expect(() => loadApiConfig({ ...base, CORS_ORIGINS: 'not a url' })).toThrow(AppError);
    expect(() => loadApiConfig({ DATABASE_URL: base.DATABASE_URL })).toThrow(
      /APP_ENCRYPTION_KEYS/u,
    );
    expect(() => loadApiConfig({ ...base, APP_ENCRYPTION_KEYS: '1:short' })).toThrow(AppError);
  });
});
