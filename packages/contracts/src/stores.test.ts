import { describe, expect, it } from 'vitest';

import {
  isDefaultLocaleOffered,
  normalizeHostname,
  orderPrefixSchema,
  publicStoreSchema,
  themeSchema,
  updateStoreSchema,
} from './stores.ts';

describe('thème de boutique', () => {
  it('un thème vide reçoit toutes les valeurs par défaut', () => {
    const theme = themeSchema.parse({});
    expect(theme.radius).toBe('md');
    expect(theme.colors.primary).toBe('#0f766e');
    expect(Object.keys(theme.colors)).toHaveLength(6);
  });

  it('les couleurs partielles complètent les autres et sont normalisées', () => {
    const theme = themeSchema.parse({ colors: { primary: '#ABCDEF' } });
    expect(theme.colors.primary).toBe('#abcdef');
    expect(theme.colors.background).toBe('#ffffff');
  });

  it('s’encode aussi (sérialisation des réponses API)', () => {
    const theme = themeSchema.parse({ colors: { primary: '#ABCDEF' } });
    expect(themeSchema.encode(theme)).toEqual(theme);
  });

  it('refuse une couleur qui pourrait injecter du CSS', () => {
    expect(themeSchema.safeParse({ colors: { primary: 'red;}body{display:none' } }).success).toBe(
      false,
    );
    expect(themeSchema.safeParse({ colors: { primary: '#fff' } }).success).toBe(false);
    expect(themeSchema.safeParse({ radius: 'xl' }).success).toBe(false);
  });
});

describe('normalisation du nom d’hôte', () => {
  it.each([
    ['Boutique-A.Localhost:4321', 'boutique-a.localhost'],
    ['shop.example.dz.', 'shop.example.dz'],
    ['  shop.example.dz  ', 'shop.example.dz'],
    ['[::1]:8080', '[::1]'],
    ['127.0.0.1:3000', '127.0.0.1'],
  ])('%s ⇒ %s', (raw, expected) => {
    expect(normalizeHostname(raw)).toBe(expected);
  });

  it.each(['', ':80', 'a..b', 'exa mple.com', '-shop.dz', 'shop-.dz', 'sh_op.dz', '[::1', 'é.dz'])(
    'refuse « %s »',
    (raw) => {
      expect(normalizeHostname(raw)).toBeUndefined();
    },
  );

  it('refuse un nom trop long', () => {
    expect(normalizeHostname(`${'a.'.repeat(130)}dz`)).toBeUndefined();
  });
});

describe('boutique publique', () => {
  it('exige au moins une langue de boutique (ar/fr)', () => {
    const base = {
      id: 'x',
      slug: 's',
      name: 'S',
      defaultLocale: 'ar',
      primaryHost: null,
      theme: {},
    };
    expect(publicStoreSchema.safeParse({ ...base, locales: [] }).success).toBe(false);
    expect(publicStoreSchema.safeParse({ ...base, locales: ['en'] }).success).toBe(false);
    expect(publicStoreSchema.parse({ ...base, locales: ['ar', 'fr'] }).theme.radius).toBe('md');
  });
});

describe('paramètres de boutique (admin)', () => {
  it('préfixe de commande : 2 à 4 lettres, mis en majuscules', () => {
    expect(orderPrefixSchema.parse(' dz ')).toBe('DZ');
    for (const bad of ['D', 'DZSTO', 'D1', 'DZ-', 'دز']) {
      expect(orderPrefixSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('modification partielle, champs inconnus et langues en double refusés', () => {
    expect(updateStoreSchema.parse({ name: '  Ma boutique ' })).toEqual({ name: 'Ma boutique' });
    expect(updateStoreSchema.safeParse({ slug: 'autre' }).success).toBe(false);
    expect(updateStoreSchema.safeParse({ isActive: false }).success).toBe(false);
    expect(updateStoreSchema.safeParse({ locales: ['ar', 'ar'] }).success).toBe(false);
    expect(updateStoreSchema.safeParse({ locales: [] }).success).toBe(false);
  });

  it('la langue par défaut doit être proposée', () => {
    expect(isDefaultLocaleOffered('ar', ['ar', 'fr'])).toBe(true);
    expect(isDefaultLocaleOffered('fr', ['ar'])).toBe(false);
  });
});
