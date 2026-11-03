import type { StoreLocale } from '@dz/contracts';

import { ar } from './ar.ts';
import { fr } from './fr.ts';

export type MessageKey = keyof typeof ar;

const DICTIONARIES: Record<StoreLocale, Record<MessageKey, string>> = { ar, fr };

/** Native language names, shown as such in the language switcher. */
export const LANGUAGE_NAMES: Record<StoreLocale, string> = { ar: 'العربية', fr: 'Français' };

/** Text direction of a storefront language. */
export const directionOf = (locale: StoreLocale): 'rtl' | 'ltr' =>
  locale === 'ar' ? 'rtl' : 'ltr';

/** Translates a key, replacing `{name}` placeholders; an unknown placeholder is left visible. */
export function translate(
  locale: StoreLocale,
  key: MessageKey,
  values: Record<string, string | number> = {},
): string {
  return DICTIONARIES[locale][key].replace(/\{(\w+)\}/gu, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

export const translator =
  (locale: StoreLocale) =>
  (key: MessageKey, values?: Record<string, string | number>): string =>
    translate(locale, key, values);
