import type { PublicStore, StoreLocale } from '@dz/contracts';

import { directionOf, translator } from '../i18n/index.ts';

export interface PageContext {
  store: PublicStore;
  locale: StoreLocale;
  dir: 'rtl' | 'ltr';
  path: string;
  origin: string;
  t: ReturnType<typeof translator>;
}

/** Store and language of the current page, as resolved by the middleware. */
export function pageContext(locals: App.Locals): PageContext {
  const { store, locale, path, origin } = locals;
  if (store === undefined || locale === undefined || path === undefined || origin === undefined) {
    throw new Error('Store context missing: the page was rendered without the store middleware');
  }
  return { store, locale, dir: directionOf(locale), path, origin, t: translator(locale) };
}
