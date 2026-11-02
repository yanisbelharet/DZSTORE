import { describe, expect, it } from 'vitest';

import { algiersDate, algiersDayRange, fixedClock, systemClock } from './time.ts';

describe('time — fuseau Africa/Algiers', () => {
  it('donne le jour local d’Alger (UTC+1) aux bornes de minuit', () => {
    expect(algiersDate(new Date('2026-01-01T22:59:59Z'))).toBe('2026-01-01');
    expect(algiersDate(new Date('2026-01-01T23:00:00Z'))).toBe('2026-01-02');
    expect(algiersDate(new Date('2026-07-15T23:30:00Z'))).toBe('2026-07-16');
  });

  it('calcule la plage UTC d’une journée d’Alger', () => {
    const { start, end } = algiersDayRange('2026-03-10');
    expect(start.toISOString()).toBe('2026-03-09T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-10T23:00:00.000Z');
  });

  it('refuse une date mal formée', () => {
    expect(() => algiersDayRange('2026-13-40')).toThrow();
    expect(() => algiersDayRange('10/03/2026')).toThrow();
  });

  it('horloge fixe pilotable pour des tests déterministes', () => {
    const clock = fixedClock('2026-11-02T10:00:00Z');
    expect(clock.now().toISOString()).toBe('2026-11-02T10:00:00.000Z');
    clock.advance(90_000);
    expect(clock.now().toISOString()).toBe('2026-11-02T10:01:30.000Z');
    clock.set('2027-01-01T00:00:00Z');
    expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('les dates rendues ne permettent pas de modifier l’horloge', () => {
    const clock = fixedClock('2026-11-02T10:00:00Z');
    clock.now().setUTCFullYear(1999);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });

  it('horloge système proche de l’heure réelle', () => {
    expect(Math.abs(systemClock.now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
