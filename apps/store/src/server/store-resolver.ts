import type { PublicStore } from '@dz/contracts';

export interface StoreResolverOptions {
  lookup: (hostname: string) => Promise<PublicStore | null>;
  /** Lifetime of a known store in memory. */
  ttlMs: number;
  /** Lifetime of "no store for this host" (shorter: a new domain shows up quickly). */
  negativeTtlMs: number;
  /** An expired store is still served for this long when the API is failing. */
  staleIfErrorMs: number;
  /** Upper bound of cached hosts (arbitrary Host headers must not grow memory forever). */
  maxEntries: number;
  now: () => number;
}

interface Entry {
  store: PublicStore | null;
  storedAt: number;
  /** While the API fails, the stale store is served without calling it again until then. */
  retryAt?: number;
}

/** Pause between two API attempts while serving a stale store (the API is failing). */
const ERROR_BACKOFF_MS = 15_000;

export type StoreResolver = (hostname: string) => Promise<PublicStore | null>;

/**
 * In-memory host → store cache in front of the API: TTL (shorter for unknown hosts), one
 * API call per host at a time (concurrent requests share it), stale store served while the
 * API is down, bounded size (oldest entry evicted first). Errors are never cached.
 */
export function createStoreResolver(options: StoreResolverOptions): StoreResolver {
  const { lookup, ttlMs, negativeTtlMs, staleIfErrorMs, maxEntries, now } = options;
  const cache = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<PublicStore | null>>();

  const remember = (hostname: string, store: PublicStore | null) => {
    cache.delete(hostname);
    cache.set(hostname, { store, storedAt: now() });
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next();
      if (oldest.done === true) break;
      cache.delete(oldest.value);
    }
  };

  return (hostname) => {
    const entry = cache.get(hostname);
    const age = entry === undefined ? Number.POSITIVE_INFINITY : now() - entry.storedAt;
    if (entry !== undefined && age < (entry.store === null ? negativeTtlMs : ttlMs)) {
      return Promise.resolve(entry.store);
    }
    if (entry?.retryAt !== undefined && now() < entry.retryAt && entry.store !== null) {
      return Promise.resolve(entry.store);
    }
    const pending = inFlight.get(hostname);
    if (pending !== undefined) return pending;

    const request = lookup(hostname)
      .then((store) => {
        remember(hostname, store);
        return store;
      })
      .catch((error: unknown) => {
        if (entry !== undefined && entry.store !== null && age < ttlMs + staleIfErrorMs) {
          entry.retryAt = now() + ERROR_BACKOFF_MS;
          return entry.store;
        }
        throw error;
      })
      .finally(() => inFlight.delete(hostname));
    inFlight.set(hostname, request);
    return request;
  };
}
