import { describe, expect, it } from 'vitest';

import { COMMUNES, communesOf, findCommune, findWilaya, WILAYAS } from './data.ts';
import { normalizeArabic, normalizeLatin } from './normalize.ts';

describe('référentiel géographique (loi 84-09 modifiée par la loi 26-06)', () => {
  it('69 wilayas numérotées de 1 à 69 et 1541 communes', () => {
    expect(WILAYAS).toHaveLength(69);
    expect(WILAYAS.map((w) => w.code)).toEqual(Array.from({ length: 69 }, (_, i) => i + 1));
    expect(COMMUNES).toHaveLength(1541);
  });

  it('chaque commune appartient à une wilaya existante ; aucune wilaya vide', () => {
    for (const c of COMMUNES) expect(findWilaya(c.wilayaCode), c.nameFr).toBeDefined();
    for (const w of WILAYAS) expect(communesOf(w.code).length, w.nameFr).toBeGreaterThan(0);
  });

  it('identifiants uniques ; pas de doublon (wilaya, nom normalisé) en arabe ni en latin', () => {
    expect(new Set(COMMUNES.map((c) => c.id)).size).toBe(COMMUNES.length);
    const keys = COMMUNES.flatMap((c) => [
      `${String(c.wilayaCode)}:fr:${normalizeLatin(c.nameFr)}`,
      `${String(c.wilayaCode)}:ar:${normalizeArabic(c.nameAr)}`,
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('effectifs fixés par la loi 26-06 pour les wilayas modifiées ou créées', () => {
    const expected: Record<number, number> = {
      3: 12,
      5: 53,
      7: 22,
      12: 24,
      13: 49,
      14: 36,
      17: 18,
      26: 43,
      28: 24,
      32: 15,
      59: 12,
      60: 8,
      61: 5,
      62: 4,
      63: 4,
      64: 6,
      65: 10,
      66: 8,
      67: 21,
      68: 23,
      69: 7,
    };
    for (const [code, count] of Object.entries(expected)) {
      expect(communesOf(Number(code)), `wilaya ${code}`).toHaveLength(count);
    }
  });

  it('wilayas créées en 2026 nommées d’après leur chef-lieu', () => {
    expect([59, 60, 66, 68, 69].map((code) => findWilaya(code)?.nameFr)).toEqual([
      'Aflou',
      'Barika',
      'Messaad',
      'Bou Saada',
      'El Abiodh Sidi Cheikh',
    ]);
  });

  it('noms ASCII sans accent, utilisables partout', () => {
    expect(findCommune(31, 'Oran')?.nameAscii).toBe('Oran');
    for (const c of COMMUNES) expect(c.nameAscii).toMatch(/^[\x20-\x7e]+$/u);
  });
});

describe('recherche d’une commune (normalisation, skill dz-geo)', () => {
  it('quelle que soit l’écriture ou la variante', () => {
    const babEzzouar = findCommune(16, 'Bab Ezzouar');
    expect(babEzzouar).toBeDefined();
    expect(findCommune(16, 'Bab El Zouar')?.id).toBe(babEzzouar?.id);
    expect(findCommune(16, 'باب الزوار')?.id).toBe(babEzzouar?.id);
    expect(findCommune(16, 'بلدية باب الزوار')?.id).toBe(babEzzouar?.id);
  });

  it('hamza, ta marbuta, alif maqsura', () => {
    const ouargla = findCommune(30, 'ورقلة');
    expect(ouargla).toBeDefined();
    expect(findCommune(30, 'ورقله')?.id).toBe(ouargla?.id);
    expect(findCommune(1, 'ادرار')?.id).toBe(findCommune(1, 'أدرار')?.id);
  });

  it('homonymes dans des wilayas différentes : jamais confondus', () => {
    const elBayadh = findCommune(32, 'Sidi Slimane');
    const tissemsilt = findCommune(38, 'Sidi Slimane');
    expect(elBayadh).toBeDefined();
    expect(tissemsilt).toBeDefined();
    expect(elBayadh?.id).not.toBe(tissemsilt?.id);
  });

  it('commune inexistante dans la wilaya ⇒ rien', () => {
    expect(findCommune(16, 'Tamanrasset')).toBeUndefined();
    expect(findCommune(16, 'Commune imaginaire')).toBeUndefined();
  });
});
