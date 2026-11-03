import type { PublicStore } from '@dz/contracts';
import { themeSchema } from '@dz/contracts';
import { describe, expect, it } from 'vitest';

import { createStoreResolver } from './store-resolver.ts';
import type { StoreResolverOptions } from './store-resolver.ts';

const store = (slug: string): PublicStore => ({
  id: slug,
  slug,
  name: slug,
  defaultLocale: 'ar',
  locales: ['ar', 'fr'],
  primaryHost: null,
  theme: themeSchema.parse({}),
});

function setup(overrides: Partial<StoreResolverOptions> = {}) {
  let clock = 0;
  const calls: string[] = [];
  let answer: (host: string) => Promise<PublicStore | null> = (host) =>
    Promise.resolve(host.startsWith('inconnu') ? null : store(host));
  const resolve = createStoreResolver({
    lookup: (host) => {
      calls.push(host);
      return answer(host);
    },
    ttlMs: 60_000,
    negativeTtlMs: 10_000,
    staleIfErrorMs: 3_600_000,
    maxEntries: 100,
    now: () => clock,
    ...overrides,
  });
  return {
    resolve,
    calls,
    advance: (ms: number) => {
      clock += ms;
    },
    answerWith: (fn: typeof answer) => {
      answer = fn;
    },
  };
}

describe('résolution hôte → boutique (cache)', () => {
  it('garde une boutique en mémoire pendant le TTL, puis redemande à l’API', async () => {
    const t = setup();
    expect((await t.resolve('a.dz'))?.slug).toBe('a.dz');
    t.advance(59_999);
    await t.resolve('a.dz');
    expect(t.calls).toEqual(['a.dz']);
    t.advance(1);
    await t.resolve('a.dz');
    expect(t.calls).toEqual(['a.dz', 'a.dz']);
  });

  it('un hôte inconnu est mémorisé moins longtemps', async () => {
    const t = setup();
    expect(await t.resolve('inconnu.dz')).toBeNull();
    t.advance(9_999);
    expect(await t.resolve('inconnu.dz')).toBeNull();
    t.advance(1);
    await t.resolve('inconnu.dz');
    expect(t.calls).toEqual(['inconnu.dz', 'inconnu.dz']);
  });

  it('des requêtes simultanées pour un même hôte partagent un seul appel', async () => {
    const t = setup();
    const results = await Promise.all([t.resolve('a.dz'), t.resolve('a.dz'), t.resolve('a.dz')]);
    expect(results.map((s) => s?.slug)).toEqual(['a.dz', 'a.dz', 'a.dz']);
    expect(t.calls).toEqual(['a.dz']);
  });

  it('API en panne : la boutique expirée reste servie, mais une erreur n’est jamais mise en cache', async () => {
    const t = setup();
    await t.resolve('a.dz');
    t.advance(120_000);
    t.answerWith(() => Promise.reject(new Error('API down')));
    expect((await t.resolve('a.dz'))?.slug).toBe('a.dz');
    // Unknown to the cache ⇒ the error propagates (the page answers 503).
    await expect(t.resolve('b.dz')).rejects.toThrow('API down');
    t.answerWith((host) => Promise.resolve(store(host)));
    expect((await t.resolve('b.dz'))?.slug).toBe('b.dz');
  });

  it('au-delà de la fenêtre « périmé si erreur », l’erreur remonte', async () => {
    const t = setup({ staleIfErrorMs: 1_000 });
    await t.resolve('a.dz');
    t.advance(61_000);
    t.answerWith(() => Promise.reject(new Error('API down')));
    await expect(t.resolve('a.dz')).rejects.toThrow('API down');
  });

  it('taille bornée : l’entrée la plus ancienne est évincée', async () => {
    const t = setup({ maxEntries: 2 });
    await t.resolve('a.dz');
    await t.resolve('b.dz');
    await t.resolve('c.dz');
    await t.resolve('b.dz');
    await t.resolve('a.dz');
    expect(t.calls).toEqual(['a.dz', 'b.dz', 'c.dz', 'a.dz']);
  });
});
