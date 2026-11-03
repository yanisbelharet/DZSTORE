import { describe, expect, it } from 'vitest';

import { cacheControlFor, securityHeaders, withFrameAncestors } from './headers.ts';

describe('en-têtes du store', () => {
  it('n’envoie HSTS qu’en production', () => {
    const local = securityHeaders({ production: false });
    expect(local['x-content-type-options']).toBe('nosniff');
    expect(local['strict-transport-security']).toBeUndefined();
    expect(local['content-security-policy']).toBeUndefined();
    expect(securityHeaders({ production: true })['strict-transport-security']).toContain(
      'max-age=63072000',
    );
  });

  it('ajoute frame-ancestors à la CSP d’Astro, ou la pose seule', () => {
    const astro = "default-src 'self'; style-src 'self' 'sha256-abc='";
    expect(withFrameAncestors(astro, [])).toBe(`${astro}; frame-ancestors 'none'`);
    expect(withFrameAncestors(null, ['https://admin.dz', 'http://localhost:5173'])).toBe(
      'frame-ancestors https://admin.dz http://localhost:5173',
    );
    // An existing frame-ancestors (never trusted) is replaced, not duplicated.
    expect(withFrameAncestors("default-src 'self'; frame-ancestors *;", [])).toBe(
      "default-src 'self'; frame-ancestors 'none'",
    );
  });

  it('HTML cacheable au CDN, revalidé par le navigateur ; erreurs jamais en cache', () => {
    expect(cacheControlFor(200)).toBe(
      'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    );
    expect(cacheControlFor(404)).toBe('public, max-age=0, s-maxage=60');
    expect(cacheControlFor(301)).toContain('s-maxage=300');
    expect(cacheControlFor(500)).toBe('no-store');
    expect(cacheControlFor(503)).toBe('no-store');
  });
});
