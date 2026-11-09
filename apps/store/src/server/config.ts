import { baseEnvSchema, loadEnv } from '@dz/core/env';
import type { EnvSource, LOG_LEVELS } from '@dz/core/env';
import { z } from 'zod';

const originList = z
  .string()
  .default('')
  .transform((raw) =>
    raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(
    z.array(
      z
        .url({ protocol: /^https?$/u, error: 'expected http(s) origins separated by commas' })
        .transform((url) => new URL(url).origin),
    ),
  );

export const storeEnvSchema = baseEnvSchema.extend({
  /** API base URL as seen from the storefront server (internal network in production). */
  STORE_API_URL: z.url({ protocol: /^https?$/u, error: 'expected an http(s) URL' }),
  /** Same value as the API's STORE_SERVICE_TOKEN. */
  STORE_SERVICE_TOKEN: z.string().min(32, { error: 'at least 32 characters' }),
  STORE_API_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
  /** How long a host → store resolution is kept in memory. */
  STORE_RESOLVE_TTL_SECONDS: z.coerce.number().int().min(0).max(3_600).default(60),
  /** Origins allowed to frame the store (admin, for the landing builder preview). Empty = none. */
  STORE_FRAME_ANCESTORS: originList,
  /** `test` on the free test deployment: visible banner, pages excluded from search engines. */
  DEPLOYMENT_ENVIRONMENT: z.enum(['local', 'test', 'production']).optional(),
});

export interface StoreConfig {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: (typeof LOG_LEVELS)[number];
  apiUrl: string;
  serviceToken: string;
  apiTimeoutMs: number;
  resolveTtlMs: number;
  frameAncestors: string[];
  testEnvironment: boolean;
}

export function loadStoreConfig(source: EnvSource = process.env): StoreConfig {
  const env = loadEnv(storeEnvSchema, source);
  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    apiUrl: env.STORE_API_URL,
    serviceToken: env.STORE_SERVICE_TOKEN,
    apiTimeoutMs: env.STORE_API_TIMEOUT_MS,
    resolveTtlMs: env.STORE_RESOLVE_TTL_SECONDS * 1000,
    frameAncestors: env.STORE_FRAME_ANCESTORS,
    testEnvironment: env.DEPLOYMENT_ENVIRONMENT === 'test',
  };
}
