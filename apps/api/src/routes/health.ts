import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export interface HealthRoutesOptions {
  checkDatabase: () => Promise<void>;
  readyTimeoutMs: number;
}

const healthResponse = z.object({ status: z.literal('ok') });
const readyResponse = z.object({
  status: z.literal('ready'),
  checks: z.object({ database: z.literal('ok') }),
});
const unavailableResponse = z.object({
  status: z.literal('unavailable'),
  checks: z.object({ database: z.literal('error') }),
});

function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`check timed out after ${String(timeoutMs)} ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/** Liveness (`/health`: the process answers) and readiness (`/ready`: dependencies answer). */
export const healthRoutes: FastifyPluginAsyncZod<HealthRoutesOptions> = (app, options) => {
  app.get('/health', { schema: { tags: ['health'], response: { 200: healthResponse } } }, () => ({
    status: 'ok' as const,
  }));

  app.get(
    '/ready',
    { schema: { tags: ['health'], response: { 200: readyResponse, 503: unavailableResponse } } },
    async (request, reply) => {
      try {
        await withTimeout(options.checkDatabase(), options.readyTimeoutMs);
        return { status: 'ready' as const, checks: { database: 'ok' as const } };
      } catch (error) {
        request.log.warn({ err: error }, 'readiness check failed');
        return reply
          .status(503)
          .send({ status: 'unavailable' as const, checks: { database: 'error' as const } });
      }
    },
  );
  return Promise.resolve();
};
