import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.ts';
import { createServerlessHandler } from './serverless.ts';
import { testDependencies } from './test/helpers.ts';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function serve(handler: Parameters<typeof createServer>[1]) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

describe('point d’entrée serverless', () => {
  it('sert la même application que le serveur Node', async () => {
    const handler = createServerlessHandler(() => buildApp(testDependencies()));
    const base = await serve((request, response) => void handler(request, response));
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('répond 503 si l’initialisation échoue, puis réessaie à l’appel suivant', async () => {
    let attempts = 0;
    const handler = createServerlessHandler(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('boot failed'))
        : buildApp(testDependencies());
    });
    const base = await serve((request, response) => void handler(request, response));
    expect((await fetch(`${base}/health`)).status).toBe(503);
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect(attempts).toBe(2);
  });
});
