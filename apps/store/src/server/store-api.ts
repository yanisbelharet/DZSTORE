import { resolveStoreResponseSchema, SERVICE_TOKEN_HEADER } from '@dz/contracts';
import type { PublicStore } from '@dz/contracts';

/** The API could not answer (network, timeout, 5xx, unexpected status or payload). */
export class StoreApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'StoreApiError';
    this.status = options.status;
  }
}

export interface StoreApiOptions {
  baseUrl: string;
  serviceToken: string;
  timeoutMs: number;
  fetch?: typeof globalThis.fetch;
}

export interface StoreApi {
  /** Active store of a hostname, `null` when no active store uses it. */
  resolveStore(hostname: string): Promise<PublicStore | null>;
}

/** Client of the API's `/v1/public/*` routes, authenticated by the service token. */
export function createStoreApi({
  baseUrl,
  serviceToken,
  timeoutMs,
  fetch = globalThis.fetch,
}: StoreApiOptions): StoreApi {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return {
    async resolveStore(hostname) {
      const url = new URL('v1/public/stores/resolve', base);
      url.searchParams.set('host', hostname);
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { [SERVICE_TOKEN_HEADER]: serviceToken, accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new StoreApiError('store API unreachable', { cause: error });
      }
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new StoreApiError(`store API answered ${String(response.status)}`, {
          status: response.status,
        });
      }
      const parsed = resolveStoreResponseSchema.safeParse(
        await response.json().catch(() => undefined),
      );
      if (!parsed.success)
        throw new StoreApiError('unexpected store API payload', { status: response.status });
      return parsed.data.store;
    },
  };
}
