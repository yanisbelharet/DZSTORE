import { AppError } from '@dz/core/errors';
import { describe, expect, it } from 'vitest';

import { assertMediaKey, createR2Storage } from './storage.ts';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function fakeR2(status: (call: Call) => number, body = new Uint8Array([1, 2, 3])) {
  const calls: Call[] = [];
  const storage = createR2Storage({
    accountId: 'a'.repeat(32),
    bucket: 'dz-media',
    accessKeyId: 'key-id',
    secretAccessKey: 'secret',
    publicBaseUrl: 'https://media.example.dz/',
    now: () => new Date('2026-11-12T10:00:00Z'),
    fetch: (input, init) => {
      const call = {
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        method: init?.method ?? 'GET',
        headers: init?.headers as Record<string, string>,
      };
      calls.push(call);
      return Promise.resolve(new Response(body, { status: status(call) }));
    },
  });
  return { storage, calls };
}

describe('stockage R2 (API compatible S3)', () => {
  it('PUT signé vers le point d’accès du compte, avec type et cache immuable', async () => {
    const { storage, calls } = fakeR2(() => 200);
    await storage.put('media/s/m/w320.avif', new Uint8Array([9]), 'image/avif');
    const [call] = calls;
    expect(call?.url).toBe(
      `https://${'a'.repeat(32)}.r2.cloudflarestorage.com/dz-media/media/s/m/w320.avif`,
    );
    expect(call?.method).toBe('PUT');
    expect(call?.headers['content-type']).toBe('image/avif');
    expect(call?.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(call?.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=key-id\/20261112\/auto\/s3\/aws4_request, SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/u,
    );
    expect(storage.publicUrl('media/s/m/w320.avif')).toBe(
      'https://media.example.dz/media/s/m/w320.avif',
    );
  });

  it('GET : contenu ; 404 ⇒ NOT_FOUND ; DELETE idempotent ; autre erreur ⇒ UNAVAILABLE', async () => {
    expect([...(await fakeR2(() => 200).storage.get('media/x.png'))]).toEqual([1, 2, 3]);
    await expect(fakeR2(() => 404).storage.get('media/x.png')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(fakeR2(() => 404).storage.delete('media/x.png')).resolves.toBeUndefined();
    await expect(
      fakeR2(() => 500).storage.put('media/x.png', new Uint8Array([1]), 'image/png'),
    ).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('clés : uniquement des chemins relatifs simples', () => {
    expect(() => {
      assertMediaKey('media/store/id/original.jpg');
    }).not.toThrow();
    for (const bad of ['../etc/passwd', 'media/../x', '/abs', 'media//x', 'Media/X', 'media/x?y']) {
      expect(() => {
        assertMediaKey(bad);
      }).toThrow(AppError);
    }
  });
});
