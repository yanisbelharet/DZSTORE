import { baseEnvSchema, loadEnv } from '@dz/core/env';
import type { EnvSource, LOG_LEVELS } from '@dz/core/env';
import { z } from 'zod';

const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

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

export const apiEnvSchema = baseEnvSchema.extend({
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//u, { error: 'expected a postgresql:// URL' }),
  /** Origins allowed by CORS. Empty by default: the admin calls the API on its own origin. */
  CORS_ORIGINS: originList,
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(10_485_760).default(262_144),
  /** Trust X-Forwarded-* headers (behind Caddy, Cloudflare or Vercel). */
  TRUST_PROXY: flag,
});

export interface ApiConfig {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: (typeof LOG_LEVELS)[number];
  host: string;
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  bodyLimitBytes: number;
  trustProxy: boolean;
  /** OpenAPI document and Swagger UI are never published in production. */
  docsEnabled: boolean;
}

export function loadApiConfig(source: EnvSource = process.env): ApiConfig {
  const env = loadEnv(apiEnvSchema, source);
  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    host: env.HOST,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    corsOrigins: env.CORS_ORIGINS,
    bodyLimitBytes: env.BODY_LIMIT_BYTES,
    trustProxy: env.TRUST_PROXY,
    docsEnabled: env.NODE_ENV !== 'production',
  };
}
