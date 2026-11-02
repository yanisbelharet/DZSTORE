import { randomBytes } from 'node:crypto';

import { sha256Hex } from '@dz/core/crypto';
import { hash, verify } from '@node-rs/argon2';

import { base32Encode } from './totp.ts';

/** OWASP minimum for Argon2id (the library default algorithm). */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Spends the same time as a real verification for unknown or locked accounts, so that response
 * times do not reveal whether an e-mail exists.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-constant-time');
  await verifyPassword(await dummyHash, password);
}

export type PasswordPolicyViolation = 'TOO_SHORT' | 'TOO_LONG' | 'SAME_AS_EMAIL' | 'LOW_VARIETY';

export function checkPasswordPolicy(password: string, email: string): PasswordPolicyViolation[] {
  const violations: PasswordPolicyViolation[] = [];
  if (password.length < 12) violations.push('TOO_SHORT');
  if (password.length > 128) violations.push('TOO_LONG');
  if (password.trim().toLowerCase() === email.trim().toLowerCase())
    violations.push('SAME_AS_EMAIL');
  if (new Set(password).size < 4) violations.push('LOW_VARIETY');
  return violations;
}

/** Ten single-use recovery codes `XXXXX-XXXXX` (50 bits each). Shown once, stored hashed. */
export function generateRecoveryCodes(count = 10): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const raw = base32Encode(randomBytes(7)).slice(0, 10);
    codes.add(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return [...codes];
}

export function hashRecoveryCode(code: string): string {
  return sha256Hex(code.replace(/[\s-]/gu, '').toUpperCase());
}
