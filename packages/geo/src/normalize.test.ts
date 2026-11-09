import { describe, expect, it } from 'vitest';

import { hasArabic, jaroWinkler, matchKey, normalizeArabic, normalizeLatin } from './normalize.ts';

describe('normalisation arabe', () => {
  it.each([
    ['الجَزَائِر', 'الجزاير'], // tachkil (+ hamza sur ya)
    ['الجـــزائر', 'الجزاير'], // tatweel
    ['أدرار', 'ادرار'], // hamza sur alif
    ['إليزي', 'اليزي'], // hamza sous alif
    ['آفلو', 'افلو'], // alif madda
    ['ورقلة', 'ورقله'], // ta marbuta
    ['عين الدفلى', 'عين الدفلي'], // alif maqsura
    ['مؤسسة', 'موسسه'], // hamza sur waw
    ['بئر مراد رايس', 'بير مراد رايس'], // hamza sur ya
    ['بلدية  باب   الزوار', 'باب الزوار'], // « بلدية » en tête, espaces multiples
  ])('%s ⇒ %s', (raw, expected) => {
    expect(normalizeArabic(raw)).toBe(expected);
  });

  it('les variantes d’écriture d’un même nom se rejoignent', () => {
    expect(normalizeArabic('عين الدفلى')).toBe(normalizeArabic('عين الدفلي'));
    expect(normalizeArabic('ورقلة')).toBe(normalizeArabic('ورقله'));
  });
});

describe('normalisation latine (rapprochement uniquement)', () => {
  it.each([
    ['Bab Ezzouar', 'Bab El Zouar'],
    ['Aïn Témouchent', 'Aine Temouchent'],
    ['Djelfa', 'Jelfa'],
    ['Chlef', 'Shlef'],
    ['Oum El Bouaghi', 'Um Bouaghi'],
    ['Bordj Bou Arréridj', 'BORDJ-BOU-ARRERIDJ'],
    ['Ksar El Boukhari', 'Ksar Boukhari'],
    ['El Kseur', 'Kseur'],
    ['Hassi R’Mel', "Hassi R'Mel"],
  ])('« %s » ≡ « %s »', (a, b) => {
    expect(normalizeLatin(a)).toBe(normalizeLatin(b));
  });

  it.each([
    ['Oran', 'Oued'],
    ['Bab El Oued', 'Bab Ezzouar'],
    ['Sétif', 'Saïda'],
  ])('« %s » ≢ « %s »', (a, b) => {
    expect(normalizeLatin(a)).not.toBe(normalizeLatin(b));
  });

  it('forme attendue (lisible pour le débogage)', () => {
    expect(normalizeLatin('Bab Ezzouar')).toBe('babzuar');
    expect(normalizeLatin('Tizi-Ouzou')).toBe('tiziuzu');
  });
});

describe('clé de comparaison et similarité', () => {
  it('choisit la normalisation selon l’écriture', () => {
    expect(hasArabic('باب الزوار')).toBe(true);
    expect(hasArabic('Bab Ezzouar')).toBe(false);
    expect(matchKey('بلدية باب الزوار')).toBe('باب الزوار');
    expect(matchKey('Bab El Zouar')).toBe('babzuar');
  });

  it('Jaro-Winkler : identique = 1, sans rapport ≈ 0, faute de frappe élevée', () => {
    expect(jaroWinkler('babzuar', 'babzuar')).toBe(1);
    expect(jaroWinkler('', 'oran')).toBe(0);
    expect(jaroWinkler('tlemcen', 'tlemsen')).toBeGreaterThan(0.9);
    expect(jaroWinkler('oran', 'tamanrasset')).toBeLessThan(0.6);
    // Classic reference value (Winkler 1990): MARTHA / MARHTA ≈ 0.961.
    expect(jaroWinkler('martha', 'marhta')).toBeCloseTo(0.961, 3);
  });
});
