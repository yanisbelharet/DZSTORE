import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import fr from './fr.json';

export const LANGUAGES = ['fr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

const STORAGE_KEY = 'dz.admin.language';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof fr };
  }
}

function storedLanguage(): Language {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'en' ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

export async function setLanguage(language: Language): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage unavailable (private mode): the choice lasts for this tab only.
  }
  document.documentElement.lang = language;
  await i18n.changeLanguage(language);
}

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: storedLanguage(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  returnNull: false,
});
document.documentElement.lang = i18n.language;

export { i18n };
