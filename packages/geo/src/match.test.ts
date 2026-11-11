import { describe, expect, it } from 'vitest';

import { matchName } from './match.ts';

// Golden cases of the skill dz-geo (carrier names → reference communes of one wilaya).
const algiers = [
  { id: 1, names: ['Bab Ezzouar', 'باب الزوار'] },
  { id: 2, names: ['Bab El Oued', 'باب الوادي'] },
  { id: 3, names: ['Bir Mourad Raïs', 'بئر مراد رايس'] },
];

describe('moteur de correspondance (exact → normalisé → approché, dans une wilaya)', () => {
  it('exact', () => {
    expect(matchName('Bab Ezzouar', algiers)).toEqual({ id: 1, method: 'EXACT', confidence: 1 });
  });

  it('normalisé : article, accents, hamza, écriture arabe', () => {
    expect(matchName('BAB EL ZOUAR', algiers)).toEqual({
      id: 1,
      method: 'NORMALIZED',
      confidence: 1,
    });
    expect(matchName('بير مراد رايس', algiers)).toEqual({
      id: 3,
      method: 'NORMALIZED',
      confidence: 1,
    });
    expect(matchName('Bir Mourad Rais', algiers)?.id).toBe(3);
  });

  it('approché : faute de frappe, avec la confiance', () => {
    const result = matchName('Bab Ezouwar', algiers);
    expect(result?.id).toBe(1);
    expect(result?.method).toBe('FUZZY');
    expect(result?.confidence).toBeGreaterThan(0.9);
  });

  it('rien de fiable ⇒ aucun résultat (commune inexistante, ambiguïté)', () => {
    expect(matchName('Tamanrasset', algiers)).toBeUndefined();
    expect(matchName('', algiers)).toBeUndefined();
    const twins = [
      { id: 1, names: ['Sidi Slimane'] },
      { id: 2, names: ['Sidi Slimane'] },
    ];
    expect(matchName('Sidi Slimane', twins)).toBeUndefined();
  });
});
