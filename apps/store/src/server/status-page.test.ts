import { describe, expect, it } from 'vitest';

import { statusPage } from './status-page.ts';

describe('pages d’état (aucune boutique affichable)', () => {
  it('hôte inconnu ⇒ 404 bilingue, brièvement cacheable, CSP stricte', async () => {
    const res = statusPage('unknownStore');
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60');
    expect(res.headers.get('content-security-policy')).toMatch(
      /^default-src 'none'; style-src 'sha256-[A-Za-z0-9+/]+=*'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'$/u,
    );
    const html = await res.text();
    expect(html).toContain('هذا المتجر غير موجود');
    expect(html).toContain('Cette boutique n’existe pas');
    expect(html).toContain('<section lang="fr" dir="ltr">');
  });

  it('API indisponible ⇒ 503 jamais mis en cache, avec Retry-After', () => {
    const res = statusPage('unavailable');
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('retry-after')).toBe('30');
  });
});
