// Job worker: `node src/main-worker.ts` — runs job rounds in a loop (ADR-0020, ADR-0023).
import { setTimeout as sleep } from 'node:timers/promises';

import { systemClock } from '@dz/core';
import { createLogger } from '@dz/core/logger';
import { createDbClient } from '@dz/db';

import { createDefaultJobEngine } from './app.ts';
import { loadApiConfig } from './config.ts';
import { createMediaStorage } from './modules/media/service.ts';

// Same configuration as the HTTP process: jobs need the same storage, keys and secrets.
const config = loadApiConfig();
const logger = createLogger({ name: 'worker', level: config.logLevel });
const db = createDbClient({ url: config.databaseUrl, maxConnections: 5 });
const jobs = createDefaultJobEngine({
  db,
  clock: systemClock,
  logger,
  media: createMediaStorage(config.media),
});
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
