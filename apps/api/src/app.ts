import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { systemClock } from '@dz/core';
import type { Clock } from '@dz/core';
import type { SecretBox } from '@dz/core/crypto';
import type { Logger } from '@dz/core/logger';
import type { DbClient } from '@dz/db';

import { maintenanceJobs, maintenanceSchedules } from './jobs/builtin.ts';
import { systemJobs, systemSubscriptions } from './jobs/system.ts';
import { createJobEngine } from './jobs/engine.ts';
import type { JobEngine } from './jobs/engine.ts';
import { JobRegistry } from './jobs/registry.ts';
import { jobsRoutes, tickRoutes } from './jobs/routes.ts';
import { fastify, LogController } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import type { ApiConfig } from './config.ts';
import { registerAccessControl } from './http/access.ts';
import type { RouteAccess } from './http/access.ts';
import { errorHandler, notFoundHandler } from './http/errors.ts';
import { registerAccessLog, registerResponseHeaders } from './http/hooks.ts';
import { requestIdFrom } from './http/request-id.ts';
import { registerAuthentication } from './modules/auth/plugin.ts';
import { auditRoutes } from './modules/audit/routes.ts';
import { authRoutes } from './modules/auth/routes.ts';
import { publicStoresRoutes } from './modules/stores/public-routes.ts';
import { geoRoutes } from './modules/geo/routes.ts';
import { mediaJobs } from './modules/media/jobs.ts';
import { localMediaFilesRoutes, mediaRoutes } from './modules/media/routes.ts';
import { createMediaStorage } from './modules/media/service.ts';
import type { MediaStorage } from './modules/media/storage.ts';
import { storesRoutes } from './modules/stores/routes.ts';
import { usersRoutes } from './modules/users/routes.ts';
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
  /** Media storage (default: from `config.media`; `null` = media disabled). */
  media?: MediaStorage | null;
  /** Job engine (default: built-in jobs and schedules). */
  jobs?: JobEngine;
}

/** Default job engine of the application (shared by the HTTP process and the worker). */
export function createDefaultJobEngine({
  db,
  clock,
  logger,
  media,
}: {
  db: DbClient;
  clock: Clock;
  logger: Logger;
  media: MediaStorage | undefined;
}): JobEngine {
  return createJobEngine({
    db,
    clock,
    logger,
    registry: new JobRegistry([...maintenanceJobs, ...systemJobs, ...mediaJobs(media)]),
    subscriptions: systemSubscriptions,
    schedules: maintenanceSchedules,
  });
}

/** A hop count trusts the n proxies closest to the server (same rule as proxy-addr). */
function fastifyTrustProxy(trust: ApiConfig['trustProxy']) {
  if (typeof trust !== 'number') return trust;
  return (_address: string, hop: number) => hop < trust;
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
  media: mediaOverride,
  jobs: jobsOverride,
}: AppDependencies) {
  const media =
    mediaOverride === undefined ? createMediaStorage(config.media) : (mediaOverride ?? undefined);
  const jobs = jobsOverride ?? createDefaultJobEngine({ db, clock, logger, media });
  const app = fastify({
    loggerInstance: logger,
    // Fastify's per-request logs are replaced by our access log (no IP, no query string).
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),
    genReqId: (request) => requestIdFrom(request.headers['x-request-id']),
    bodyLimit: config.bodyLimitBytes,
    trustProxy: fastifyTrustProxy(config.trustProxy),
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

  // Order matters: cookies are parsed, then the session is resolved, then access rules are
  // enforced — all before any route is registered (onRoute must see every /v1 route).
  await app.register(cookie);
  const authDeps = { db, clock, secretBox };
  registerAuthentication(app, { ...authDeps, cookieSecure: config.cookieSecure });
  const routeAccess = registerAccessControl(app, { serviceToken: config.storeServiceToken });
  app.decorate('routeAccess', routeAccess);

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'DZ Commerce OS API', version: API_VERSION },
    },
    transform: jsonSchemaTransform,
  });
  if (config.docsEnabled) {
    app.get('/v1/openapi.json', { config: { access: 'public' }, schema: { hide: true } }, () =>
      app.swagger(),
    );
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  await app.register(healthRoutes, { checkDatabase, readyTimeoutMs });
  await app.register(usersRoutes, { prefix: '/v1/users', deps: { db, clock } });
  await app.register(storesRoutes, { prefix: '/v1/stores', db });
  await app.register(geoRoutes, { prefix: '/v1/geo', db });
  await app.register(mediaRoutes, {
    prefix: '/v1/stores/:storeId/media',
    deps: { db, clock, jobs, storage: media },
  });
  if (media && config.media.driver === 'local') {
    await app.register(localMediaFilesRoutes, { prefix: '/media', storage: media });
  }
  await app.register(publicStoresRoutes, { prefix: '/v1/public/stores', db });
  await app.register(auditRoutes, { prefix: '/v1/audit', db });
  await app.register(jobsRoutes, { prefix: '/v1/jobs', db, jobs, clock });
  await app.register(tickRoutes, { prefix: '/v1/internal', jobs, tickSecret: config.tickSecret });
  await app.register(authRoutes, {
    prefix: '/v1/auth',
    deps: authDeps,
    cookieSecure: config.cookieSecure,
  });
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

declare module 'fastify' {
  interface FastifyInstance {
    /** Access rule of every `/v1/*` route (used by the RBAC matrix test). */
    routeAccess: readonly RouteAccess[];
  }
}
