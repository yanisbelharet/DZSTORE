// Job worker: `node src/main-worker.ts` — runs job rounds in a loop (ADR-0020, ADR-0023).
import { setTimeout as sleep } from 'node:timers/promises';

import { systemClock } from '@dz/core';
import { baseEnvSchema, loadEnv } from '@dz/core/env';
import { createLogger } from '@dz/core/logger';
import { createDbClient } from '@dz/db';
import { z } from 'zod';

import { createDefaultJobEngine } from './app.ts';

const env = loadEnv(
  baseEnvSchema.extend({ DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//u) }),
);
const logger = createLogger({ name: 'worker', level: env.LOG_LEVEL });
const db = createDbClient({ url: env.DATABASE_URL, maxConnections: 5 });
const jobs = createDefaultJobEngine({ db, clock: systemClock, logger });
const IDLE_POLL_MS = 1_000;

const stop = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'stopping after the current job');
    stop.abort();
  });
}

await jobs.ensureSchedules();
logger.info({ workerId: jobs.workerId }, 'worker started');
while (!stop.signal.aborted) {
  try {
    const stats = await jobs.runTick({ budgetMs: 5_000, maxJobs: 50 });
    const busy = stats.relayed + stats.succeeded + stats.retried + stats.dead > 0;
    if (!busy) await sleep(IDLE_POLL_MS, undefined, { signal: stop.signal }).catch(() => undefined);
  } catch (error) {
    logger.error({ err: error }, 'job round failed');
    await sleep(5 * IDLE_POLL_MS, undefined, { signal: stop.signal }).catch(() => undefined);
  }
}
await db.$disconnect();
logger.info('worker stopped');
