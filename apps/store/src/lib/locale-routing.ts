import type { PublicStore, StoreLocale } from '@dz/contracts';

interface StoreLocales {
  defaultLocale: PublicStore['defaultLocale'];
  locales: readonly StoreLocale[];
}

export type LocaleRoute =
  { kind: 'page'; locale: StoreLocale; path: string } | { kind: 'redirect'; location: string };

/**
 * URL scheme: the store's default language has no prefix (`/`), every other language of the
 * store is prefixed (`/fr/…`). A prefix naming the default language redirects to the
 * unprefixed URL (one URL per page). `path` is the page path without the language prefix.
 */
export function routeLocale(pathname: string, store: StoreLocales, search = ''): LocaleRoute {
  const [, first = '', ...rest] = pathname.split('/');
  const isStoreLocale = (store.locales as readonly string[]).includes(first);
  if (!isStoreLocale) return { kind: 'page', locale: store.defaultLocale, path: pathname };
  const path = `/${rest.join('/')}`;
  if (first === store.defaultLocale) return { kind: 'redirect', location: `${path}${search}` };
  return { kind: 'page', locale: first as StoreLocale, path };
}

/** Path of `path` (without prefix) in `locale`. */
export function localizedPath(locale: StoreLocale, path: string, store: StoreLocales): string {
  if (locale === store.defaultLocale) return path;
  return path === '/' ? `/${locale}/` : `/${locale}${path}`;
}

/** Every language version of a page, for hreflang links and the language switcher. */
export function alternates(
  path: string,
  store: StoreLocales,
): { locale: StoreLocale; path: string }[] {
  return store.locales.map((locale) => ({ locale, path: localizedPath(locale, path, store) }));
}
