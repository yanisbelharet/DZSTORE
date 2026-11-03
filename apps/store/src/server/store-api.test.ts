import { SERVICE_TOKEN_HEADER } from '@dz/contracts';
import { describe, expect, it } from 'vitest';

import { createStoreApi, StoreApiError } from './store-api.ts';

const TOKEN = 'service-token-'.padEnd(40, 'x');
const STORE = {
  id: '0190',
  slug: 'alpha',
  name: 'Alpha',
  defaultLocale: 'ar',
  locales: ['ar', 'fr'],
  primaryHost: 'alpha.dz',
  theme: {},
};

function fakeFetch(respond: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetch = (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    return Promise.resolve(respond(url, init));
  };
  return { fetch, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('client API du store', () => {
  it('appelle /v1/public/stores/resolve avec le jeton de service et valide la réponse', async () => {
    const { fetch, calls } = fakeFetch(() => json(200, { store: STORE }));
    const api = createStoreApi({
      baseUrl: 'http://api.internal:3000/base',
      serviceToken: TOKEN,
      timeoutMs: 500,
      fetch,
    });
    const store = await api.resolveStore('alpha.dz');
    expect(store?.slug).toBe('alpha');
    expect(store?.theme.radius).toBe('md');
    const call = calls[0];
    expect(call?.url.toString()).toBe(
      'http://api.internal:3000/base/v1/public/stores/resolve?host=alpha.dz',
    );
    expect(new Headers(call?.init.headers).get(SERVICE_TOKEN_HEADER)).toBe(TOKEN);
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('404 ⇒ aucune boutique (null)', async () => {
    const { fetch } = fakeFetch(() => json(404, { error: { code: 'NOT_FOUND' } }));
    const api = createStoreApi({
      baseUrl: 'http://api',
      serviceToken: TOKEN,
      timeoutMs: 500,
      fetch,
    });
    expect(await api.resolveStore('inconnu.dz')).toBeNull();
  });

  it.each([
    ['401 (jeton refusé)', () => json(401, {})],
    ['503', () => json(503, {})],
    ['réponse non conforme', () => json(200, { store: { slug: 'x' } })],
    ['corps non JSON', () => new Response('<html>', { status: 200 })],
  ])('%s ⇒ StoreApiError (jamais pris pour « boutique inconnue »)', async (_label, respond) => {
    const { fetch } = fakeFetch(respond);
    const api = createStoreApi({
      baseUrl: 'http://api',
      serviceToken: TOKEN,
      timeoutMs: 500,
      fetch,
    });
    await expect(api.resolveStore('alpha.dz')).rejects.toBeInstanceOf(StoreApiError);
  });

  it('réseau en panne ou délai dépassé ⇒ StoreApiError', async () => {
    const fetch = (() => Promise.reject(new TypeError('fetch failed'))) as typeof globalThis.fetch;
    const api = createStoreApi({
      baseUrl: 'http://api',
      serviceToken: TOKEN,
      timeoutMs: 500,
      fetch,
    });
    await expect(api.resolveStore('alpha.dz')).rejects.toThrow('store API unreachable');
  });
});
