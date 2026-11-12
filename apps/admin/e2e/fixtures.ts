import { createHmac } from 'node:crypto';

export const OWNER = {
  email: 'owner@e2e.test',
  name: 'Yanis Propriétaire',
  password: 'owner password e2e',
};
export const AGENT = {
  email: 'agent@e2e.test',
  name: 'Amel Agent',
  password: 'agent password e2e',
};

export const STORE = { name: 'Boutique E2E', hostname: 'e2e.localhost' };

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text.toUpperCase()) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238 code, as an authenticator app would display it (test helper). */
export function totpNow(secret: string, offsetSteps = 0): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
