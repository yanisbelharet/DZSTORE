import { parseEncryptionKeys } from '@dz/core/crypto';
import type { KeyRing } from '@dz/core/crypto';
import { baseEnvSchema, loadEnv } from '@dz/core/env';
import { AppError } from '@dz/core/errors';
import type { EnvSource, LOG_LEVELS } from '@dz/core/env';
import { z } from 'zod';

const flag = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
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
  /**
   * Proxies trusted for X-Forwarded-*: `false` (direct), a number of hops (Vercel: 1;
   * Cloudflare → Caddy: 2) or a comma-separated list of proxy addresses/CIDR. `true` trusts the
   * client-controlled left-most X-Forwarded-For value: refused in production.
   */
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((raw, ctx): boolean | number | string[] => {
      const value = raw.trim();
      if (value === 'false' || value === '') return false;
      if (value === 'true') return true;
      if (/^\d+$/u.test(value)) return Number(value);
      const list = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      if (list.every((item) => /^[0-9a-f.:/]+$/iu.test(item))) return list;
      ctx.addIssue({
        code: 'custom',
        message: 'expected false, a hop count or a list of proxy IP/CIDR',
      });
      return z.NEVER;
    }),
  /** `<version>:<base64 32 bytes>,…` — encrypts TOTP secrets and integration tokens (ADR-0009). */
  APP_ENCRYPTION_KEYS: z.string().min(1, { error: 'required, see .env.example' }),
  /** Secure session cookie (`__Host-` prefix). Only `false` for plain-http local setups. */
  SESSION_COOKIE_SECURE: flag('true'),
  /** Enables POST /v1/internal/tick (serverless job processing). Unset = endpoint disabled. */
  TICK_SECRET: z.string().min(32, { error: 'at least 32 characters' }).optional(),
  /** Shared with the storefront server for `/v1/public/*`. Unset = those routes refuse all calls. */
  STORE_SERVICE_TOKEN: z.string().min(32, { error: 'at least 32 characters' }).optional(),
  /**
   * Media storage (ADR-0017): `local` disk, Cloudflare `r2`, or `disabled` (uploads answer 503).
   * Default: `local`, except on Vercel (read-only disk) where it is `disabled`.
   */
  MEDIA_DRIVER: z.enum(['local', 'r2', 'disabled']).optional(),
  MEDIA_LOCAL_DIR: z.string().min(1).default('var/media'),
  /** Public base URL of media files (CDN). Local default: `http://localhost:<PORT>/media`. */
  MEDIA_PUBLIC_BASE_URL: z.url({ protocol: /^https?$/u }).optional(),
  R2_ACCOUNT_ID: z
    .string()
    .regex(/^[0-9a-f]{32}$/u, { error: 'expected a Cloudflare account id' })
    .optional(),
  R2_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u)
    .optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Set by Vercel on its build and runtime. */
  VERCEL: z.string().optional(),
});

export type MediaConfig =
  | { driver: 'disabled' }
  | { driver: 'local'; directory: string; publicBaseUrl: string }
  | {
      driver: 'r2';
      accountId: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicBaseUrl: string;
    };

export interface ApiConfig {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: (typeof LOG_LEVELS)[number];
  host: string;
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  bodyLimitBytes: number;
  /** Fastify `trustProxy`: hop count, address list, or boolean (true = trust everything). */
  trustProxy: boolean | number | string[];
  /** OpenAPI document and Swagger UI are never published in production. */
  docsEnabled: boolean;
  encryptionKeys: KeyRing;
  cookieSecure: boolean;
  tickSecret: string | undefined;
  storeServiceToken: string | undefined;
  media: MediaConfig;
}

type ApiEnv = z.output<typeof apiEnvSchema>;

function mediaConfig(env: ApiEnv): MediaConfig {
  // Unset: local disk, except where no public URL can be derived (Vercel's read-only disk,
  // production without MEDIA_PUBLIC_BASE_URL): media are then disabled, never half-working.
  const fallback =
    env.VERCEL === '1' || (env.NODE_ENV === 'production' && env.MEDIA_PUBLIC_BASE_URL === undefined)
      ? 'disabled'
      : 'local';
  const driver = env.MEDIA_DRIVER ?? fallback;
  if (driver === 'disabled') return { driver };
  if (driver === 'local') {
    if (env.NODE_ENV === 'production' && env.MEDIA_PUBLIC_BASE_URL === undefined) {
      throw new AppError(
        'INVALID_CONFIGURATION',
        'MEDIA_PUBLIC_BASE_URL is required in production',
        {
          details: { variables: ['MEDIA_PUBLIC_BASE_URL'] },
        },
      );
    }
    return {
      driver,
      directory: env.MEDIA_LOCAL_DIR,
      publicBaseUrl: env.MEDIA_PUBLIC_BASE_URL ?? `http://localhost:${String(env.PORT)}/media`,
    };
  }
  const {
    R2_ACCOUNT_ID,
    R2_BUCKET,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    MEDIA_PUBLIC_BASE_URL,
  } = env;
  if (
    R2_ACCOUNT_ID === undefined ||
    R2_BUCKET === undefined ||
    R2_ACCESS_KEY_ID === undefined ||
    R2_SECRET_ACCESS_KEY === undefined ||
    MEDIA_PUBLIC_BASE_URL === undefined
  ) {
    throw new AppError('INVALID_CONFIGURATION', 'MEDIA_DRIVER=r2 needs every R2_* variable', {
      details: {
        variables: [
          'R2_ACCOUNT_ID',
          'R2_BUCKET',
          'R2_ACCESS_KEY_ID',
          'R2_SECRET_ACCESS_KEY',
          'MEDIA_PUBLIC_BASE_URL',
        ],
      },
    });
  }
  return {
    driver,
    accountId: R2_ACCOUNT_ID,
    bucket: R2_BUCKET,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    publicBaseUrl: MEDIA_PUBLIC_BASE_URL,
  };
}

export function loadApiConfig(source: EnvSource = process.env): ApiConfig {
  const env = loadEnv(apiEnvSchema, source);
  if (env.NODE_ENV === 'production' && env.TRUST_PROXY === true) {
    throw new AppError(
      'INVALID_CONFIGURATION',
      'TRUST_PROXY=true is refused in production: set a hop count or proxy list',
      {
        details: { variables: ['TRUST_PROXY'] },
      },
    );
  }
  if (env.NODE_ENV === 'production' && !env.SESSION_COOKIE_SECURE) {
    throw new AppError(
      'INVALID_CONFIGURATION',
      'SESSION_COOKIE_SECURE=false is refused in production',
      {
        details: { variables: ['SESSION_COOKIE_SECURE'] },
      },
    );
  }
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
    encryptionKeys: parseEncryptionKeys(env.APP_ENCRYPTION_KEYS),
    cookieSecure: env.SESSION_COOKIE_SECURE,
    tickSecret: env.TICK_SECRET,
    storeServiceToken: env.STORE_SERVICE_TOKEN,
    media: mediaConfig(env),
  };
}
