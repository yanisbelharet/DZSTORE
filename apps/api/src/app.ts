import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { systemClock } from '@dz/core';
import type { Clock } from '@dz/core';
import type { SecretBox } from '@dz/core/crypto';
import type { Logger } from '@dz/core/logger';
import type { DbClient } from '@dz/db';
import { fastify, LogController } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import type { ApiConfig } from './config.ts';
import { errorHandler, notFoundHandler } from './http/errors.ts';
import { registerAccessLog, registerResponseHeaders } from './http/hooks.ts';
import { requestIdFrom } from './http/request-id.ts';
import { registerAuthentication } from './modules/auth/plugin.ts';
import { authRoutes } from './modules/auth/routes.ts';
import { healthRoutes } from './routes/health.ts';

export interface AppDependencies {
  config: ApiConfig;
  logger: Logger;
  db: DbClient;
  secretBox: SecretBox;
  clock?: Clock;
  /** Resolves when the database answers; used by `/ready` (default: `SELECT 1`). */
  checkDatabase?: () => Promise<void>;
  readyTimeoutMs?: number;
}

export const API_VERSION = '0.1.0';

/** Builds the HTTP application. Same app for the Node server and the serverless entry point. */
export async function buildApp({
  config,
  logger,
  db,
  secretBox,
  clock = systemClock,
  checkDatabase = async () => {
    await db.$queryRaw`SELECT 1`;
  },
  readyTimeoutMs = 2_000,
}: AppDependencies) {
  const app = fastify({
    loggerInstance: logger,
    // Fastify's per-request logs are replaced by our access log (no IP, no query string).
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),
    genReqId: (request) => requestIdFrom(request.headers['x-request-id']),
    bodyLimit: config.bodyLimitBytes,
    trustProxy: config.trustProxy,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  registerResponseHeaders(app, { production: config.nodeEnv === 'production' });
  registerAccessLog(app);

  const allowedOrigins = new Set(config.corsOrigins);
  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, origin !== undefined && allowedOrigins.has(origin));
    },
    credentials: true,
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'DZ Commerce OS API', version: API_VERSION },
    },
    transform: jsonSchemaTransform,
  });
  if (config.docsEnabled) {
    app.get('/v1/openapi.json', { schema: { hide: true } }, () => app.swagger());
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  await app.register(cookie);
  const authDeps = { db, clock, secretBox };
  registerAuthentication(app, { ...authDeps, cookieSecure: config.cookieSecure });

  await app.register(healthRoutes, { checkDatabase, readyTimeoutMs });
  await app.register(authRoutes, {
    prefix: '/v1/auth',
    deps: authDeps,
    cookieSecure: config.cookieSecure,
  });
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
