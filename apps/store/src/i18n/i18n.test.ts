import { describe, expect, it } from 'vitest';

import { ar } from './ar.ts';
import { fr } from './fr.ts';
import { directionOf, translate } from './index.ts';

describe('i18n du store', () => {
  it('l’arabe et le français ont exactement les mêmes clés, sans texte vide', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(ar).sort());
    for (const text of [...Object.values(ar), ...Object.values(fr)])
      expect(text.trim()).not.toBe('');
  });

  it('les deux langues utilisent les mêmes variables dans chaque message', () => {
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/gu)].map((m) => m[1]).sort();
    for (const key of Object.keys(ar) as (keyof typeof ar)[]) {
      expect(vars(fr[key]), key).toEqual(vars(ar[key]));
    }
  });

  it('interpole les variables et laisse visibles celles qui manquent', () => {
    expect(translate('fr', 'home.title', { store: 'Alpha' })).toBe('Bienvenue chez Alpha');
    expect(translate('ar', 'home.title', { store: 'Alpha' })).toBe('مرحبًا بكم في Alpha');
    expect(translate('fr', 'footer.rights', { store: 'Alpha' })).toContain('{year}');
  });

  it('l’arabe s’affiche de droite à gauche, le français de gauche à droite', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('fr')).toBe('ltr');
  });
});
