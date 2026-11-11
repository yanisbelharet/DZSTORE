import { describe, expect, it } from 'vitest';

import {
  COMMUNES,
  communesOf,
  findCommune,
  findCommuneInLegacyWilaya,
  findWilaya,
  searchCommunes,
  WILAYAS,
} from './data.ts';
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

describe('codes 59 à 69 : décret présidentiel n° 26-206 du 25 mai 2026 (JO n° 40, ADR-0026)', () => {
  it('figés : code, nom et chef-lieu', () => {
    const decree: [number, string][] = [
      [59, 'Aflou'],
      [60, 'Barika'],
      [61, 'El Kantara'],
      [62, 'Bir El Ater'],
      [63, 'El Aricha'],
      [64, 'Ksar Chellala'],
      [65, 'Aïn Ouessara'],
      [66, 'Messaad'],
      [67, 'Ksar El Boukhari'],
      [68, 'Bou Saada'],
      [69, 'El Abiodh Sidi Cheikh'],
    ];
    for (const [code, name] of decree) {
      expect(normalizeLatin(findWilaya(code)?.nameFr ?? ''), String(code)).toBe(
        normalizeLatin(name),
      );
      expect(findCommune(code, name), `chef-lieu ${name}`).toBeDefined();
    }
  });

  it('wilaya de l’ancien modèle (58) : celle d’origine pour 59–69, la même pour 1–58', () => {
    const mother: Record<number, number> = {
      59: 3,
      60: 5,
      61: 7,
      62: 12,
      63: 13,
      64: 14,
      65: 17,
      66: 17,
      67: 26,
      68: 28,
      69: 32,
    };
    for (const c of COMMUNES) {
      expect(c.legacyWilayaCode, c.nameFr).toBe(
        c.wilayaCode <= 58 ? c.wilayaCode : mother[c.wilayaCode],
      );
    }
  });
});

describe('anciens noms et variantes (GeoAlias)', () => {
  it('commune renommée par la loi 26-06 : retrouvée par son ancien nom, en arabe et en français', () => {
    const menaa = findCommune(68, 'Menaâ');
    expect(menaa).toBeDefined();
    expect(findCommune(68, 'Ouled Atia')?.id).toBe(menaa?.id);
    expect(findCommune(68, 'أولاد عطية')?.id).toBe(menaa?.id);
    expect(menaa?.aliases).toContainEqual({ lang: 'fr', name: 'Ouled Atia', kind: 'FORMER_NAME' });
    const eddouair = findCommune(26, 'Eddouair');
    expect(findCommune(26, 'Tlatet Eddouar')?.id).toBe(eddouair?.id);
    expect(findCommune(24, 'Kheraza')?.id).toBe(findCommune(24, 'Khezarra')?.id);
  });

  it('ancien modèle à 58 wilayas : « Aflou, Laghouat » et « Ouled Atia, M’Sila » trouvées', () => {
    expect(findCommuneInLegacyWilaya(3, 'Aflou')?.wilayaCode).toBe(59);
    expect(findCommuneInLegacyWilaya(28, 'Ouled Atia')?.wilayaCode).toBe(68);
    expect(findCommuneInLegacyWilaya(3, 'Bab Ezzouar')).toBeUndefined();
  });

  it('recherche nationale par nom : propose la bonne wilaya', () => {
    expect(searchCommunes('Aflou').map((c) => c.wilayaCode)).toEqual([59]);
    expect(searchCommunes('أفلو').map((c) => c.wilayaCode)).toEqual([59]);
    expect(new Set(searchCommunes('Sidi Slimane').map((c) => c.wilayaCode)).size).toBeGreaterThan(
      1,
    );
    expect(searchCommunes('')).toEqual([]);
  });

  it('entrées à vérifier signalées (El Borma : Ouargla ou Touggourt)', () => {
    expect(findCommune(55, 'El Borma')?.toVerify).toMatch(/EcoTrack/u);
    expect(COMMUNES.filter((c) => c.toVerify !== null).length).toBeLessThan(10);
  });
});
