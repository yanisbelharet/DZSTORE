import { createLogger } from '@dz/core/logger';
import type { Logger } from '@dz/core/logger';

import { loadStoreConfig } from './config.ts';
import type { StoreConfig } from './config.ts';
import { securityHeaders } from './headers.ts';
import { createStoreApi } from './store-api.ts';
import { createStoreResolver } from './store-resolver.ts';
import type { StoreResolver } from './store-resolver.ts';

export interface StoreRuntime {
  config: StoreConfig;
  logger: Logger;
  resolveStore: StoreResolver;
  securityHeaders: Readonly<Record<string, string>>;
}

let runtime: StoreRuntime | undefined;

/** Process-wide services of the storefront server, created on first use from the environment. */
export function getRuntime(): StoreRuntime {
  runtime ??= createRuntime(loadStoreConfig());
  return runtime;
}

export function createRuntime(config: StoreConfig): StoreRuntime {
  const api = createStoreApi({
    baseUrl: config.apiUrl,
    serviceToken: config.serviceToken,
    timeoutMs: config.apiTimeoutMs,
  });
  return {
    config,
    logger: createLogger({ name: 'store', level: config.logLevel }),
    resolveStore: createStoreResolver({
      lookup: (hostname) => api.resolveStore(hostname),
      ttlMs: config.resolveTtlMs,
      negativeTtlMs: Math.min(config.resolveTtlMs, 10_000),
      staleIfErrorMs: 60 * 60_000,
      maxEntries: 1_000,
      now: () => Date.now(),
    }),
    securityHeaders: securityHeaders({ production: config.nodeEnv === 'production' }),
  };
}
