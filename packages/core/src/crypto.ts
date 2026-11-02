import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { AppError } from './errors.ts';

/** Secret encryption (ADR-0009): AES-256-GCM, random 96-bit IV, versioned keys. */
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type KeyRing = ReadonlyMap<number, Buffer>;

export interface SealedSecret {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  keyVersion: number;
}

export interface SealOptions {
  /** Binds the ciphertext to its owner (e.g. `carrier:<id>`): decrypting elsewhere fails. */
  context?: string;
}

export interface SecretBox {
  readonly currentVersion: number;
  encrypt(plaintext: string, options?: SealOptions): SealedSecret;
  decrypt(sealed: SealedSecret, options?: SealOptions): string;
  needsRotation(sealed: SealedSecret): boolean;
}

function keyConfigError(reason: string, details: Record<string, unknown> = {}): AppError {
  return new AppError('INVALID_CONFIGURATION', `Invalid encryption key configuration: ${reason}`, {
    details: { reason, ...details },
  });
}

/** Parses `APP_ENCRYPTION_KEYS` = `1:<base64 32 bytes>,2:<base64 32 bytes>`. */
export function parseEncryptionKeys(spec: string): KeyRing {
  const entries = spec
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) throw keyConfigError('NO_KEY');

  const keys = new Map<number, Buffer>();
  entries.forEach((entry, position) => {
    const separator = entry.indexOf(':');
    const versionText = separator === -1 ? entry : entry.slice(0, separator);
    const keyText = separator === -1 ? '' : entry.slice(separator + 1);
    if (!/^[1-9]\d{0,5}$/u.test(versionText)) throw keyConfigError('INVALID_VERSION', { position });
    const version = Number(versionText);
    if (keys.has(version)) throw keyConfigError('DUPLICATE_VERSION', { version });
    const key = Buffer.from(keyText, 'base64');
    if (key.length !== KEY_BYTES || key.toString('base64') !== keyText) {
      throw keyConfigError('INVALID_KEY', { version, expectedBytes: KEY_BYTES });
    }
    keys.set(version, key);
  });
  return keys;
}

function decryptionError(reason: string, details: Record<string, unknown> = {}): AppError {
  return new AppError('SECRET_DECRYPTION_FAILED', 'Secret could not be decrypted', {
    details: { reason, ...details },
  });
}

function additionalData(keyVersion: number, context: string | undefined): Buffer {
  return Buffer.from(`dz-secret|v${String(keyVersion)}|${context ?? ''}`, 'utf8');
}

export function createSecretBox(keys: KeyRing): SecretBox {
  const versions = [...keys.keys()];
  if (versions.length === 0) throw keyConfigError('NO_KEY');
  const currentVersion = Math.max(...versions);
  const keyFor = (version: number): Buffer => {
    const key = keys.get(version);
    if (!key) throw decryptionError('UNKNOWN_KEY_VERSION', { keyVersion: version });
    return key;
  };

  return {
    currentVersion,
    encrypt(plaintext, options = {}) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, keyFor(currentVersion), iv, {
        authTagLength: TAG_BYTES,
      });
      cipher.setAAD(additionalData(currentVersion, options.context));
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: currentVersion };
    },
    decrypt(sealed, options = {}) {
      const key = keyFor(sealed.keyVersion);
      if (sealed.iv.length !== IV_BYTES || sealed.authTag.length !== TAG_BYTES) {
        throw decryptionError('MALFORMED');
      }
      const decipher = createDecipheriv(ALGORITHM, key, sealed.iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(additionalData(sealed.keyVersion, options.context));
      decipher.setAuthTag(sealed.authTag);
      try {
        return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString(
          'utf8',
        );
      } catch {
        throw decryptionError('AUTHENTICATION_FAILED', { keyVersion: sealed.keyVersion });
      }
    },
    needsRotation(sealed) {
      return sealed.keyVersion !== currentVersion;
    },
  };
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/** URL-safe random token (session tokens, idempotency keys…). 32 bytes ⇒ 43 characters. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time comparison, including for strings of different lengths. */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}

/** Masked display of a secret: last 4 characters only for long values. */
export function last4(value: string): string {
  return value.length >= 12 ? `••••${value.slice(-4)}` : '••••';
}
