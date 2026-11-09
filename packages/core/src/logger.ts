import { pino, stdSerializers } from 'pino';
import type { DestinationStream, LevelWithSilent, Logger } from 'pino';

/**
 * Structured logger with mandatory redaction (ADR-0016): personal data and secrets never reach
 * the logs, whether they appear under a known key or inside a free-text value.
 */
const REDACTED = '[REDACTED]';

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/gu, '');

const SENSITIVE_KEYS = new Set(
  [
    // credentials and secrets
    'password',
    'passwordHash',
    'newPassword',
    'currentPassword',
    'token',
    'accessToken',
    'refreshToken',
    'apiToken',
    'api_token',
    'sessionToken',
    'apiKey',
    'x-api-key',
    'secret',
    'clientSecret',
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-service-token',
    'serviceToken',
    'totp',
    'totpSecret',
    'otp',
    'recoveryCodes',
    'ciphertext',
    // customer identity and contact (also EcoTrack field names)
    'phone',
    'phone2',
    'phoneNumber',
    'mobile',
    'telephone',
    'telephone_2',
    'tel',
    'tel2',
    'customerName',
    'recipientName',
    'fullName',
    'firstName',
    'lastName',
    'nom_client',
    'client',
    'address',
    'adresse',
    'address2',
    'gps_link',
    'email',
    // network and tracking identifiers
    'ip',
    'clientIp',
    'ipAddress',
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'cf-connecting-ip',
    'userAgent',
    'user-agent',
    'deviceId',
    'fbp',
    'fbc',
    'ttp',
    'fbclid',
    'ttclid',
  ].map(normalizeKey),
);

/**
 * Any key CONTAINING one of these (normalized) fragments is a secret too: `tickSecret`,
 * `x-dz-service-token`, `storeServiceToken`, `recoveryCode`… without listing every name.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'secret',
  'token',
  'cookie',
  'authorization',
  'apikey',
  'recoverycode',
];

const isSensitiveKey = (key: string): boolean => {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEYS.has(normalized) ||
    SENSITIVE_KEY_FRAGMENTS.some((part) => normalized.includes(part))
  );
};

const VALUE_PATTERNS: readonly (readonly [RegExp, string])[] = [
  // Credentials embedded in a URL (`postgresql://user:password@host/db`), any scheme.
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/giu, '$1[REDACTED]@'],
  // URLs: keep origin and path, drop query string and fragment (EcoTrack sends api_token there)
  [/\b(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/giu, '$1?[REDACTED]'],
  [
    /\b(api_token|access_token|token|api_key|apikey|key|password|secret)=[^&\s"']+/giu,
    '$1=[REDACTED]',
  ],
  [/\bBearer\s+[\w.~+/=-]+/gu, 'Bearer [REDACTED]'],
  [/[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/giu, '[EMAIL]'],
  // Algerian phone numbers: international (+213 / 00213 / 213), mobile, landline
  [/(?<!\d)(?:\+|00)?213[\s.-]?[5-7](?:[\s.-]?\d){8}(?!\d)/gu, '[PHONE]'],
  [/(?<!\d)0[5-7](?:[\s.-]?\d){8}(?!\d)/gu, '[PHONE]'],
  [/(?<!\d)0[2-4](?:[\s.-]?\d){7}(?!\d)/gu, '[PHONE]'],
  // IPv4 addresses
  [/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/gu, '[IP]'],
];

export function scrubString(value: string): string {
  return VALUE_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}

function scrubValue(value: unknown, ancestors: Set<object>): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (ancestors.has(value)) return '[Circular]';
  ancestors.add(value);
  try {
    // pino's serialized error has a custom prototype: copy its own fields into a plain object.
    if (value instanceof Error) return scrubValue({ ...stdSerializers.err(value) }, ancestors);
    if (Array.isArray(value)) return value.map((item: unknown) => scrubValue(item, ancestors));
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return '[Binary]';
    // Only plain objects are traversed: sockets, streams, requests, maps… are summarized by
    // type so that logging never walks (or leaks) large internal structures.
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return `[${value.constructor.name || 'Object'}]`;
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = isSensitiveKey(key) ? REDACTED : scrubValue(item, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

/** Returns a redacted deep copy; the input is never mutated. Cycles become `[Circular]`. */
export function scrub(value: unknown): unknown {
  return scrubValue(value, new Set());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function scrubRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result = scrub(record);
  return isRecord(result) ? result : {};
}

export interface CreateLoggerOptions {
  name: string;
  level: LevelWithSilent;
  /** Output stream (defaults to stdout). Tests pass an in-memory stream. */
  destination?: DestinationStream;
}

export type { Logger };

export function createLogger({ name, level, destination }: CreateLoggerOptions): Logger {
  const logger = pino(
    {
      name,
      level,
      timestamp: pino.stdTimeFunctions.isoTime,
      // Errors are already serialized (and scrubbed) by the `log` formatter, which pino runs
      // before serializers: re-serializing would lose the original type (`Object`).
      serializers: { err: (value: unknown) => value },
      formatters: {
        bindings: scrubRecord,
        log: scrubRecord,
      },
      hooks: {
        logMethod(args, method) {
          const [first, ...rest] = args;
          // An Error logged without message would otherwise use its raw message as `msg`.
          const cleaned: unknown[] =
            first instanceof Error && typeof rest[0] !== 'string'
              ? [first, scrubString(first.message), ...rest]
              : args.map((arg: unknown) => (typeof arg === 'string' ? scrubString(arg) : arg));
          Reflect.apply(method, this, cleaned);
        },
      },
    },
    destination ?? pino.destination(1),
  );
  return logger;
}
