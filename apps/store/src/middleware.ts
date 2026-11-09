import { normalizeHostname } from '@dz/contracts';
import type { PublicStore } from '@dz/contracts';
import { defineMiddleware } from 'astro:middleware';

import { routeLocale } from './lib/locale-routing.ts';
import { cacheControlFor, withFrameAncestors } from './server/headers.ts';
import { getRuntime } from './server/runtime.ts';
import { statusPage } from './server/status-page.ts';

/**
 * The store is chosen from the raw `Host` header — the value the CDN keys its cache on — and
 * never from `X-Forwarded-Host`, which a client could set to render store B under store A's
 * URL and poison the cache (ARCHITECTURE R9). Astro's own `context.url` is not used for this:
 * it only trusts hosts listed statically in `security.allowedDomains` (ADR-0024).
 */
const requestHost = (request: Request) => request.headers.get('host') ?? '';

/**
 * Build assets are served by the adapter before any page code: a request reaching the
 * middleware means the file does not exist. It gets a bare 404 (no store, no page render).
 */
const missingAsset = () =>
  new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': cacheControlFor(404) },
  });

/**
 * Every page request: host → store (API, cached), language from the path, then security and
 * CDN cache headers. No store ⇒ a static status page; the pages never render without a store.
 */
/** Security headers on responses built here (status pages, missing assets). */
const withSecurityHeaders = (response: Response, headers: Readonly<Record<string, string>>) => {
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;
  // Liveness probe: no store, no API call.
  if (pathname === '/health') return next();

  const runtime = getRuntime();
  if (pathname.startsWith('/_astro/'))
    return withSecurityHeaders(missingAsset(), runtime.securityHeaders);
  const hostname = normalizeHostname(requestHost(context.request));
  let store: PublicStore | null;
  try {
    store = hostname === undefined ? null : await runtime.resolveStore(hostname);
  } catch (error) {
    runtime.logger.error({ err: error }, 'store resolution failed');
    return withSecurityHeaders(statusPage('unavailable'), runtime.securityHeaders);
  }
  if (store === null)
    return withSecurityHeaders(statusPage('unknownStore'), runtime.securityHeaders);

  const route = routeLocale(pathname, store, search);
  let rendered: Response;
  if (route.kind === 'redirect') {
    rendered = new Response(null, { status: 301, headers: { location: route.location } });
  } else {
    context.locals.store = store;
    context.locals.locale = route.locale;
    context.locals.path = route.path;
    // Canonical URLs always use https and the primary domain when the store has one.
    context.locals.origin = `https://${store.primaryHost ?? hostname ?? ''}`;
    context.locals.testEnvironment = runtime.config.testEnvironment;
    // A language prefix is a rewrite: one page file serves every language.
    rendered = route.path === pathname ? await next() : await next(`${route.path}${search}`);
  }

  // Copy: responses produced by the framework may have immutable headers.
  const response = new Response(rendered.body, rendered);
  for (const [name, value] of Object.entries(runtime.securityHeaders))
    response.headers.set(name, value);
  response.headers.set(
    'content-security-policy',
    withFrameAncestors(
      response.headers.get('content-security-policy'),
      runtime.config.frameAncestors,
    ),
  );
  if (!response.headers.has('cache-control'))
    response.headers.set('cache-control', cacheControlFor(response.status));
  if (route.kind === 'page') response.headers.set('content-language', route.locale);
  if (runtime.config.testEnvironment) response.headers.set('x-robots-tag', 'noindex, nofollow');
  return response;
});
