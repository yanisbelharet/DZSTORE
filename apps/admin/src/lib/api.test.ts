import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError, errorKey } from './api.ts';

const respond = (status: number, body: unknown) =>
  vi.fn(() =>
    Promise.resolve(new Response(body === null ? null : JSON.stringify(body), { status })),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('client API', () => {
  it('appelle /api sur la même origine avec l’en-tête anti-CSRF et le corps JSON', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await api('/v1/users', { method: 'POST', body: { a: 1 } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/users');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toMatchObject({ 'x-dz-csrf': '1', 'content-type': 'application/json' });
    expect(init.body).toBe('{"a":1}');
  });

  it('envoie un fichier en octets bruts avec son propre type', async () => {
    const fetchMock = respond(201, { id: 'm' });
    vi.stubGlobal('fetch', fetchMock);
    const file = new Blob([new Uint8Array([1, 2])], { type: 'image/png' });
    await api('/v1/stores/s/media', { method: 'POST', body: file });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'content-type': 'image/png', 'x-dz-csrf': '1' });
    expect(init.body).toBe(file);
  });

  it('transforme l’enveloppe d’erreur de l’API en ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      respond(422, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'x',
          details: { violations: ['TOO_SHORT'] },
          requestId: 'r',
        },
      }),
    );
    const error = await api('/v1/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    expect(errorKey(error)).toBe('errors.TOO_SHORT');
  });

  it('serveur injoignable ⇒ code NETWORK ; 204 ⇒ undefined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const error = await api('/v1/x').catch((e: unknown) => e);
    expect(errorKey(error)).toBe('errors.network');
    vi.stubGlobal('fetch', respond(204, null));
    expect(await api('/v1/x')).toBeUndefined();
  });
});
