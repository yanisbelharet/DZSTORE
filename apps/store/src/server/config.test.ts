import { describe, expect, it } from 'vitest';

import { loadStoreConfig } from './config.ts';

const TOKEN = 'x'.repeat(32);

describe('configuration du store', () => {
  it('valeurs par défaut sûres', () => {
    const config = loadStoreConfig({
      STORE_API_URL: 'http://api:3000',
      STORE_SERVICE_TOKEN: TOKEN,
    });
    expect(config).toMatchObject({
      nodeEnv: 'development',
      apiUrl: 'http://api:3000',
      apiTimeoutMs: 2000,
      resolveTtlMs: 60_000,
      frameAncestors: [],
    });
  });

  it('normalise les origines autorisées à encadrer le store', () => {
    const config = loadStoreConfig({
      STORE_API_URL: 'http://api:3000',
      STORE_SERVICE_TOKEN: TOKEN,
      STORE_FRAME_ANCESTORS: 'https://admin.example.dz/, http://localhost:5173',
    });
    expect(config.frameAncestors).toEqual(['https://admin.example.dz', 'http://localhost:5173']);
  });

  it('refuse une configuration incomplète sans jamais afficher le jeton', () => {
    const secret = 'short-secret-value';
    let message = '';
    try {
      loadStoreConfig({ STORE_API_URL: 'ftp://api', STORE_SERVICE_TOKEN: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toMatch(/STORE_API_URL/u);
    expect(message).toMatch(/STORE_SERVICE_TOKEN/u);
    expect(message).not.toContain(secret);
  });
});
