import { describe, expect, it } from 'vitest';

import { alternates, localizedPath, routeLocale } from './locale-routing.ts';

const arFirst = { defaultLocale: 'ar', locales: ['ar', 'fr'] } as const;
const frOnly = { defaultLocale: 'fr', locales: ['fr'] } as const;

describe('routage par langue', () => {
  it('sans préfixe ⇒ langue par défaut de la boutique', () => {
    expect(routeLocale('/', arFirst)).toEqual({ kind: 'page', locale: 'ar', path: '/' });
    expect(routeLocale('/p/montre', arFirst)).toEqual({
      kind: 'page',
      locale: 'ar',
      path: '/p/montre',
    });
    expect(routeLocale('/', frOnly)).toEqual({ kind: 'page', locale: 'fr', path: '/' });
  });

  it('préfixe d’une autre langue de la boutique ⇒ cette langue, chemin sans préfixe', () => {
    expect(routeLocale('/fr', arFirst)).toEqual({ kind: 'page', locale: 'fr', path: '/' });
    expect(routeLocale('/fr/', arFirst)).toEqual({ kind: 'page', locale: 'fr', path: '/' });
    expect(routeLocale('/fr/p/montre', arFirst)).toEqual({
      kind: 'page',
      locale: 'fr',
      path: '/p/montre',
    });
  });

  it('préfixe de la langue par défaut ⇒ redirection vers l’URL unique (requête conservée)', () => {
    expect(routeLocale('/ar/p/montre', arFirst, '?utm_source=fb')).toEqual({
      kind: 'redirect',
      location: '/p/montre?utm_source=fb',
    });
    expect(routeLocale('/ar', arFirst)).toEqual({ kind: 'redirect', location: '/' });
  });

  it('jamais de redirection vers un autre site (`//hote`)', () => {
    expect(routeLocale('/ar//evil.com', arFirst)).toEqual({
      kind: 'redirect',
      location: '/evil.com',
    });
    expect(routeLocale('/fr//evil.com', arFirst)).toEqual({
      kind: 'page',
      locale: 'fr',
      path: '/evil.com',
    });
  });

  it('une langue que la boutique ne propose pas n’est pas un préfixe (⇒ 404 de la page)', () => {
    expect(routeLocale('/ar/', frOnly)).toEqual({ kind: 'page', locale: 'fr', path: '/ar/' });
    expect(routeLocale('/en/', arFirst)).toEqual({ kind: 'page', locale: 'ar', path: '/en/' });
  });

  it('construit les chemins localisés et les alternatives hreflang', () => {
    expect(localizedPath('fr', '/', arFirst)).toBe('/fr/');
    expect(localizedPath('fr', '/p/x', arFirst)).toBe('/fr/p/x');
    expect(localizedPath('ar', '/p/x', arFirst)).toBe('/p/x');
    expect(alternates('/p/x', arFirst)).toEqual([
      { locale: 'ar', path: '/p/x' },
      { locale: 'fr', path: '/fr/p/x' },
    ]);
  });
});
