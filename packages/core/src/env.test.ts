import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { baseEnvSchema, loadEnv } from './env.ts';
import { AppError } from './errors.ts';

const schema = baseEnvSchema.extend({
  DATABASE_URL: z.url(),
  API_SECRET: z.string().min(32, { error: 'au moins 32 caractères' }),
});

describe('loadEnv', () => {
  it('valide et applique les valeurs par défaut', () => {
    const env = loadEnv(schema, {
      DATABASE_URL: 'postgresql://dz:dz@localhost:5432/dz_dev',
      API_SECRET: 'x'.repeat(32),
    });
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.DATABASE_URL).toBe('postgresql://dz:dz@localhost:5432/dz_dev');
  });

  it('échoue explicitement en nommant les variables fautives', () => {
    expect(() => loadEnv(schema, { NODE_ENV: 'staging' })).toThrow(AppError);
    try {
      loadEnv(schema, { NODE_ENV: 'staging' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      expect(message).toContain('NODE_ENV');
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('API_SECRET');
    }
  });

  it('ne divulgue jamais la valeur d’une variable invalide', () => {
    const leaked = 'super-secret-value-123';
    try {
      loadEnv(schema, { DATABASE_URL: leaked, API_SECRET: leaked });
      expect.unreachable();
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      expect(error.message).not.toContain(leaked);
      expect(JSON.stringify(error.details)).not.toContain(leaked);
      expect(error.message).toContain('au moins 32 caractères');
    }
  });
});
