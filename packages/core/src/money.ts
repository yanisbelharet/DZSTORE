import { AppError } from './errors.ts';

/**
 * Algerian dinars as integers (ADR-0005). The brand prevents mixing raw numbers and amounts.
 * Negative values are allowed (reversals, refunds); callers enforce sign rules where relevant.
 */
declare const dzdBrand: unique symbol;
export type Dzd = number & { readonly [dzdBrand]: true };

export type MoneyLocale = 'ar' | 'fr' | 'en';

export function isDzd(value: unknown): value is Dzd {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function dzd(value: number): Dzd {
  if (!isDzd(value)) {
    throw new AppError('VALIDATION_FAILED', 'Amount must be a safe integer number of dinars', {
      details: { reason: 'NOT_SAFE_INTEGER' },
    });
  }
  return value;
}

export const ZERO_DZD = dzd(0);

export function addDzd(...amounts: readonly Dzd[]): Dzd {
  return dzd(amounts.reduce<number>((sum, amount) => sum + amount, 0));
}

export function subDzd(a: Dzd, b: Dzd): Dzd {
  return dzd(a - b);
}

export function mulDzd(amount: Dzd, quantity: number): Dzd {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new AppError('VALIDATION_FAILED', 'Quantity must be a non-negative integer', {
      details: { reason: 'INVALID_QUANTITY' },
    });
  }
  return dzd(amount * quantity);
}

const FORMATTERS: Record<MoneyLocale, Intl.NumberFormat> = {
  ar: new Intl.NumberFormat('ar-DZ', {
    style: 'currency',
    currency: 'DZD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
  fr: new Intl.NumberFormat('fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
  en: new Intl.NumberFormat('en-DZ', {
    style: 'currency',
    currency: 'DZD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
};

export function formatDzd(amount: Dzd, locale: MoneyLocale): string {
  return FORMATTERS[locale].format(amount);
}
