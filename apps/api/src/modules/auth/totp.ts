import { createHmac, randomBytes } from 'node:crypto';

/** Time-based one-time passwords (RFC 6238: HMAC-SHA1, 30 s steps, 6 digits). */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_SECONDS = 30;
const ISSUER = 'DZ Commerce OS';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET.charAt((value << (5 - bits)) & 31);
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/gu, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160-bit random secret, base32-encoded (what authenticator apps expect). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function timeStep(at: Date): number {
  return Math.floor(at.getTime() / 1000 / PERIOD_SECONDS);
}

export function totpCode(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export interface VerifyTotpOptions {
  /** Accepted clock drift, in steps on each side (default 1 = ±30 s). */
  window?: number;
  /** Last accepted step for this user: a code can only be used once. */
  lastUsedStep?: number | null;
}

/** Returns the matched time step, or null if the code is invalid, expired or replayed. */
export function verifyTotp(
  secret: string,
  code: string,
  at: Date,
  { window = 1, lastUsedStep = null }: VerifyTotpOptions = {},
): number | null {
  if (!/^\d{6}$/u.test(code)) return null;
  const current = timeStep(at);
  for (let offset = -window; offset <= window; offset += 1) {
    const step = current + offset;
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (totpCode(secret, step) === code) return step;
  }
  return null;
}

export function otpauthUrl({ secret, account }: { secret: string; account: string }): string {
  const label = encodeURIComponent(`${ISSUER}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
