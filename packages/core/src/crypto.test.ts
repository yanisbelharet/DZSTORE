import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createSecretBox,
  last4,
  parseEncryptionKeys,
  randomToken,
  safeEqual,
  sha256Hex,
} from './crypto.ts';
import { AppError } from './errors.ts';

const key = () => randomBytes(32).toString('base64');

describe('crypto — secrets AES-256-GCM (ADR-0009)', () => {
  it('aller-retour chiffrement / déchiffrement', () => {
    const box = createSecretBox(parseEncryptionKeys(`1:${key()}`));
    const sealed = box.encrypt('ecotrack-token-abc');
    expect(sealed.keyVersion).toBe(1);
    expect(Buffer.from(sealed.ciphertext).toString('utf8')).not.toContain('ecotrack');
    expect(box.decrypt(sealed)).toBe('ecotrack-token-abc');
  });

  it('IV différent à chaque chiffrement', () => {
    const box = createSecretBox(parseEncryptionKeys(`1:${key()}`));
    const a = box.encrypt('same');
    const b = box.encrypt('same');
    expect(Buffer.from(a.iv).equals(Buffer.from(b.iv))).toBe(false);
    expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(false);
  });

  it('rejette un texte chiffré ou un tag altérés', () => {
    const box = createSecretBox(parseEncryptionKeys(`1:${key()}`));
    const sealed = box.encrypt('secret');
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    expect(() => box.decrypt({ ...sealed, ciphertext: tampered })).toThrow(AppError);
    const badTag = Buffer.from(sealed.authTag);
    badTag[0] = (badTag[0] ?? 0) ^ 0xff;
    expect(() => box.decrypt({ ...sealed, authTag: badTag })).toThrow(AppError);
  });

  it('lie le secret à son contexte (pas d’échange entre lignes)', () => {
    const box = createSecretBox(parseEncryptionKeys(`1:${key()}`));
    const sealed = box.encrypt('token', { context: 'carrier:A' });
    expect(box.decrypt(sealed, { context: 'carrier:A' })).toBe('token');
    expect(() => box.decrypt(sealed, { context: 'carrier:B' })).toThrow(AppError);
  });

  it('rotation : la nouvelle clé chiffre, les anciennes déchiffrent encore', () => {
    const k1 = key();
    const before = createSecretBox(parseEncryptionKeys(`1:${k1}`));
    const old = before.encrypt('old-secret');
    const after = createSecretBox(parseEncryptionKeys(`1:${k1},2:${key()}`));
    expect(after.currentVersion).toBe(2);
    expect(after.decrypt(old)).toBe('old-secret');
    expect(after.needsRotation(old)).toBe(true);
    const fresh = after.encrypt('new-secret');
    expect(fresh.keyVersion).toBe(2);
    expect(after.needsRotation(fresh)).toBe(false);
  });

  it('version de clé inconnue ⇒ erreur', () => {
    const sealed = createSecretBox(parseEncryptionKeys(`3:${key()}`)).encrypt('x');
    const other = createSecretBox(parseEncryptionKeys(`1:${key()}`));
    expect(() => other.decrypt(sealed)).toThrow(AppError);
  });

  it.each([
    ['', 'vide'],
    ['1', 'sans clé'],
    ['abc:' + key(), 'version non numérique'],
    ['1:' + randomBytes(16).toString('base64'), 'clé de 16 octets'],
    [`1:${key()},1:${key()}`, 'version en double'],
  ])('refuse la configuration de clés « %s » (%s)', (spec) => {
    expect(() => parseEncryptionKeys(spec)).toThrow(AppError);
  });

  it('les erreurs de configuration ne contiennent pas la clé', () => {
    const shortKey = randomBytes(16).toString('base64');
    try {
      parseEncryptionKeys(`1:${shortKey}`);
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(shortKey);
    }
  });

  it('utilitaires : empreinte, jeton, comparaison, masquage', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(randomToken()).not.toBe(token);
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(last4('ecotrack-token-9f3a')).toBe('••••9f3a');
    expect(last4('abc')).toBe('••••');
  });
});
