import type { FastifyBaseLogger, FastifyTypeProvider } from 'fastify';

import type { AnyApp } from './types.ts';

const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Security headers on every response (ARCHITECTURE §6) and request id echo. */
export function registerResponseHeaders<L extends FastifyBaseLogger, P extends FastifyTypeProvider>(
  app: AnyApp<L, P>,
  { production }: { production: boolean },
) {
  app.addHook('onSend', (request, reply, payload, done) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('cross-origin-resource-policy', 'same-origin');
    // Swagger UI (never in production) needs scripts and styles.
    if (!request.url.startsWith('/docs')) reply.header('content-security-policy', API_CSP);
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    if (production)
      reply.header('strict-transport-security', 'max-age=63072000; includeSubDomains');
    done(null, payload);
  });
}

/** One access log line per request: no IP, no query string, no headers. */
export function registerAccessLog<L extends FastifyBaseLogger, P extends FastifyTypeProvider>(
  app: AnyApp<L, P>,
) {
  app.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      {
        method: request.method,
        path: request.url.split('?')[0],
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      'request completed',
    );
    done();
  });
}
