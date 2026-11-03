import type { StoreLocale } from '@dz/contracts';

import { directionOf, translate } from '../i18n/index.ts';
import type { MessageKey } from '../i18n/index.ts';
import { cacheControlFor } from './headers.ts';
import { cspHash } from './csp.ts';

const STYLE =
  'body{margin:0;min-height:100vh;display:grid;place-content:center;gap:2rem;padding:1rem;' +
  'font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;text-align:center}' +
  'h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;color:#475569}';

const PAGES = {
  unknownStore: { status: 404, title: 'unknownStore.title', body: undefined },
  unavailable: { status: 503, title: 'unavailable.title', body: 'unavailable.body' },
} as const satisfies Record<
  string,
  { status: number; title: MessageKey; body: MessageKey | undefined }
>;

export type StatusPageKind = keyof typeof PAGES;

/** Same message in every storefront language: the store (hence its language) is unknown. */
const LOCALES: readonly StoreLocale[] = ['ar', 'fr'];

/**
 * Minimal page answered when no store can be shown (unknown host, API unavailable). Fully
 * static text, no store data, its own strict CSP (one hashed inline style, nothing else).
 */
export function statusPage(kind: StatusPageKind): Response {
  const page = PAGES[kind];
  const sections = LOCALES.map((locale) => {
    const body = page.body === undefined ? '' : `<p>${translate(locale, page.body)}</p>`;
    return `<section lang="${locale}" dir="${directionOf(locale)}"><h1>${translate(locale, page.title)}</h1>${body}</section>`;
  }).join('');
  const html =
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<meta name="robots" content="noindex"><title>${translate('ar', page.title)}</title>` +
    `<style>${STYLE}</style></head><body><main>${sections}</main></body></html>`;
  return new Response(html, {
    status: page.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': cacheControlFor(page.status),
      'content-security-policy':
        `default-src 'none'; style-src '${cspHash(STYLE)}'; base-uri 'none'; ` +
        "form-action 'none'; frame-ancestors 'none'",
      ...(page.status === 503 ? { 'retry-after': '30' } : {}),
    },
  });
}
