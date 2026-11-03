/** Response headers of the storefront (ARCHITECTURE §6 « En-têtes et protections web », §8). */

export interface SecurityHeaderOptions {
  production: boolean;
  /** Origins allowed to frame the store (admin builder preview). Empty ⇒ nobody. */
  frameAncestors: readonly string[];
}

/**
 * Headers added to every storefront response (the CSP itself is built by Astro, see
 * `withFrameAncestors`).
 */
export function securityHeaders({
  production,
}: Pick<SecurityHeaderOptions, 'production'>): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    'cross-origin-opener-policy': 'same-origin',
    ...(production
      ? { 'strict-transport-security': 'max-age=63072000; includeSubDomains; preload' }
      : {}),
  };
}

/**
 * Same HTML for every visitor ⇒ cached by the CDN per host (the host is part of the URL, hence
 * of the cache key). Browsers always revalidate. Errors are not cached; 404s briefly.
 */
export function cacheControlFor(status: number): string {
  if (status === 200) return 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400';
  if (status === 404 || status === 410) return 'public, max-age=0, s-maxage=60';
  if (status >= 300 && status < 400) return 'public, max-age=0, s-maxage=300';
  return 'no-store';
}

/**
 * Astro computes the page CSP (hashes of its scripts and styles) and sends it as a header.
 * `frame-ancestors` depends on the runtime configuration: it is merged into that policy, or
 * sent alone when the response has none (redirects, endpoints).
 */
export function withFrameAncestors(
  policy: string | null,
  frameAncestors: readonly string[],
): string {
  const directive = `frame-ancestors ${frameAncestors.length > 0 ? frameAncestors.join(' ') : "'none'"}`;
  const kept = (policy ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^frame-ancestors(\s|$)/iu.test(part));
  return [...kept, directive].join('; ');
}
