import { describe, expect, it } from 'vitest';

import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUrl,
  timeStep,
  totpCode,
  verifyTotp,
} from './totp.ts';

// RFC 6238, annexe B (SHA-1, secret ASCII « 12345678901234567890 », 8 chiffres).
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('vecteur officiel T=%i → %s', (seconds, expected) => {
    expect(totpCode(RFC_SECRET, timeStep(new Date(seconds * 1000)), 8)).toBe(expected);
  });

  it('base32 aller-retour, insensible à la casse et aux espaces', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
    const encoded = base32Encode(bytes);
    expect(encoded).toMatch(/^[A-Z2-7]+$/u);
    expect(base32Decode(encoded.toLowerCase().replace(/(.{4})/gu, '$1 '))).toEqual(bytes);
    expect(() => base32Decode('ABC1')).toThrow();
  });

  it('secret aléatoire de 160 bits', () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret)).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it('accepte le pas courant et ±1 pas (décalage d’horloge), refuse au-delà', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-11-02T10:00:15Z');
    const step = timeStep(now);
    for (const offset of [-1, 0, 1]) {
      expect(verifyTotp(secret, totpCode(secret, step + offset), now)).toBe(step + offset);
    }
    expect(verifyTotp(secret, totpCode(secret, step + 2), now)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, step - 2), now)).toBeNull();
  });

  it('refuse un code déjà utilisé (anti-rejeu) ou mal formé', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-11-02T10:00:15Z');
    const step = timeStep(now);
    const code = totpCode(secret, step);
    expect(verifyTotp(secret, code, now, { lastUsedStep: step })).toBeNull();
    expect(verifyTotp(secret, code, now, { lastUsedStep: step - 1 })).toBe(step);
    expect(verifyTotp(secret, '12345', now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('URI otpauth pour les applications d’authentification', () => {
    const url = new URL(otpauthUrl({ secret: 'JBSWY3DPEHPK3PXP', account: 'owner@dz.test' }));
    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(decodeURIComponent(url.pathname)).toBe('/DZ Commerce OS:owner@dz.test');
    expect(url.searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(url.searchParams.get('issuer')).toBe('DZ Commerce OS');
  });
});
