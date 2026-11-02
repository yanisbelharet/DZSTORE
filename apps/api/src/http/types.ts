import type { IncomingMessage, ServerResponse } from 'node:http';

import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyTypeProvider,
  RawServerDefault,
} from 'fastify';

/** Any app instance, whatever its logger and type provider (for app-level registrations). */
export type AnyApp<
  Logger extends FastifyBaseLogger = FastifyBaseLogger,
  Provider extends FastifyTypeProvider = FastifyTypeProvider,
> = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, Logger, Provider>;
