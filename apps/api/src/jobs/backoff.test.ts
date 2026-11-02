import { describe, expect, it } from 'vitest';

import { backoffDelayMs } from './backoff.ts';

describe('backoff exponentiel avec jitter', () => {
  it('double à chaque essai à partir de 30 s, plafonné à 1 h', () => {
    const noJitter = () => 0.5;
    expect([1, 2, 3, 4, 8, 20].map((attempt) => backoffDelayMs(attempt, noJitter))).toEqual([
      30_000, 60_000, 120_000, 240_000, 3_600_000, 3_600_000,
    ]);
  });

  it('jitter borné à ± 20 %', () => {
    expect(backoffDelayMs(2, () => 0)).toBe(48_000);
    expect(backoffDelayMs(2, () => 1)).toBe(72_000);
  });
});
