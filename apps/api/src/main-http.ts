// Production/development HTTP server: `node src/main-http.ts` (Node 24 runs TypeScript, ADR-0022).
import { createRuntime } from './bootstrap.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const runtime = await createRuntime();
await runtime.app.listen({ host: runtime.config.host, port: runtime.config.port });

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  runtime.logger.info({ signal }, 'shutting down: draining in-flight requests');
  const forceExit = setTimeout(() => {
    runtime.logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();
  try {
    await runtime.close();
    runtime.logger.info('shutdown complete');
    process.exit(0);
  } catch (error) {
    runtime.logger.error({ err: error }, 'shutdown failed');
    process.exit(1);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, (received) => {
    void shutdown(received);
  });
}
