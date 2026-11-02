import { describe, expect, it } from 'vitest';

import { AppError } from './errors.ts';
import { addDzd, dzd, formatDzd, isDzd, mulDzd, subDzd, ZERO_DZD } from './money.ts';

describe('money — dinars algériens en entiers', () => {
  it('accepte les entiers sûrs, y compris négatifs (contre-passations)', () => {
    expect(dzd(3900)).toBe(3900);
    expect(dzd(-200)).toBe(-200);
    expect(ZERO_DZD).toBe(0);
  });

  it.each([1.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'refuse %s',
    (value) => {
      expect(() => dzd(value)).toThrow(AppError);
    },
  );

  it('additionne, soustrait et multiplie en restant entier', () => {
    expect(addDzd(dzd(3900), dzd(600), ZERO_DZD)).toBe(4500);
    expect(addDzd()).toBe(0);
    expect(subDzd(dzd(4500), dzd(600))).toBe(3900);
    expect(mulDzd(dzd(3900), 3)).toBe(11700);
  });

  it('refuse une quantité non entière ou négative', () => {
    expect(() => mulDzd(dzd(100), 1.5)).toThrow(AppError);
    expect(() => mulDzd(dzd(100), -1)).toThrow(AppError);
  });

  it('détecte un dépassement des entiers sûrs', () => {
    expect(() => addDzd(dzd(Number.MAX_SAFE_INTEGER), dzd(1))).toThrow(AppError);
    expect(() => mulDzd(dzd(Number.MAX_SAFE_INTEGER), 2)).toThrow(AppError);
  });

  it('isDzd distingue les montants valides', () => {
    expect(isDzd(1200)).toBe(true);
    expect(isDzd(12.5)).toBe(false);
    expect(isDzd('1200')).toBe(false);
  });

  it('formate en français, arabe et anglais sans décimales', () => {
    expect(formatDzd(dzd(12345), 'fr')).toMatch(/^12\s345\sDA$/u);
    const ar = formatDzd(dzd(12345), 'ar');
    expect(ar).toContain('12.345');
    expect(ar).toContain('د.ج');
    expect(formatDzd(dzd(12345), 'en')).toMatch(/^DZD\s12,345$/u);
  });
});
