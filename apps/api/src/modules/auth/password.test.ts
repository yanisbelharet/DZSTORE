import { describe, expect, it } from 'vitest';

import {
  checkPasswordPolicy,
  generateRecoveryCodes,
  hashPassword,
  hashRecoveryCode,
  verifyPassword,
} from './password.ts';

describe('mots de passe (Argon2id)', () => {
  it('hache en Argon2id avec les paramètres OWASP et vérifie', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/u);
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery!')).toBe(false);
  });

  it('un hash corrompu est un échec, pas une exception', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('politique : 12 à 128 caractères, différent de l’e-mail, pas un seul caractère répété', () => {
    expect(checkPasswordPolicy('court', 'a@dz.test')).toContain('TOO_SHORT');
    expect(checkPasswordPolicy('x'.repeat(129), 'a@dz.test')).toContain('TOO_LONG');
    expect(checkPasswordPolicy('owner@dz.test', 'owner@dz.test')).toContain('SAME_AS_EMAIL');
    expect(checkPasswordPolicy('aaaaaaaaaaaaaa', 'a@dz.test')).toContain('LOW_VARIETY');
    expect(checkPasswordPolicy('correct horse battery', 'a@dz.test')).toEqual([]);
  });

  it('codes de secours : 10 codes uniques, hachage normalisé', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/u);
    const [first] = codes;
    if (first === undefined) throw new Error('no code');
    expect(hashRecoveryCode(first.toLowerCase().replace('-', ' '))).toBe(hashRecoveryCode(first));
  });
});
