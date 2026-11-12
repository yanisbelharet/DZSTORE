/** Store chosen in the header switcher (preference only, per browser). */
export const STORE_KEY = 'dz.admin.store';

export function readSelectedStore(): string {
  try {
    return localStorage.getItem(STORE_KEY) ?? 'all';
  } catch {
    return 'all';
  }
}

export function writeSelectedStore(value: string): void {
  try {
    localStorage.setItem(STORE_KEY, value);
  } catch {
    // Preference only.
  }
}

/** Amount in dinars, formatted for the interface language. */
export const formatDzd = (amount: number, language: string): string =>
  `${new Intl.NumberFormat(language === 'en' ? 'en' : 'fr-FR').format(amount)} DA`;
