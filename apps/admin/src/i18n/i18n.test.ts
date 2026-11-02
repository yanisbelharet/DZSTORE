import { describe, expect, it } from 'vitest';

import en from './en.json';
import fr from './fr.json';

function keys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('traductions de l’admin', () => {
  it('le français et l’anglais ont exactement les mêmes clés', () => {
    expect(keys(en).sort()).toEqual(keys(fr).sort());
  });

  it('aucune traduction vide', () => {
    for (const dictionary of [fr, en]) {
      const values = JSON.stringify(dictionary);
      expect(values).not.toMatch(/:\s*""/u);
    }
  });

  it('les mêmes variables d’interpolation dans les deux langues', () => {
    const variables = (text: string) =>
      [...text.matchAll(/\{\{(\w+)\}\}/gu)].map((m) => m[1]).sort();
    const flat = (dict: unknown, path: string[]): string =>
      path.reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dict) as string;
    for (const key of keys(fr)) {
      const path = key.split('.');
      expect(variables(flat(en, path)), key).toEqual(variables(flat(fr, path)));
    }
  });
});
