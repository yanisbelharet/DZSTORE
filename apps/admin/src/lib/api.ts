/** Error returned by the API, with its stable code (translated by the UI). */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads the uniform error envelope (`apiErrorSchema` of @dz/contracts) without bundling Zod in
 * the first screen of the admin: a small structural check is enough on this path.
 */
function apiErrorOf(
  payload: unknown,
): { code: string; message: string; details: Record<string, unknown> } | undefined {
  if (!isRecord(payload) || !isRecord(payload.error)) return undefined;
  const { code, message, details } = payload.error;
  if (typeof code !== 'string' || typeof message !== 'string') return undefined;
  return { code, message, details: isRecord(details) ? details : {} };
}

/**
 * Calls the API on the same origin (`/api`, ADR-0021) with the session cookie and the anti-CSRF
 * header. Throws `ApiError` (code from the API) or `ApiError('NETWORK')` when unreachable.
 */
export async function api<T>(
  path: string,
  { method = 'GET', body, signal }: RequestOptions = {},
): Promise<T> {
  // A Blob (file) is sent as raw bytes with its own type; anything else as JSON.
  const isFile = body instanceof Blob;
  const contentType = isFile ? body.type : 'application/json';
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'x-dz-csrf': '1',
        ...(body === undefined ? {} : { 'content-type': contentType }),
      },
      ...(body === undefined ? {} : { body: isFile ? body : JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK', 'Network error');
  }
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = apiErrorOf(payload);
    if (error) throw new ApiError(response.status, error.code, error.message, error.details);
    throw new ApiError(response.status, 'INTERNAL', `HTTP ${String(response.status)}`);
  }
  return payload as T;
}

const KNOWN_CODES = [
  'INVALID_CREDENTIALS',
  'INVALID_TWO_FACTOR_CODE',
  'RATE_LIMITED',
  'VALIDATION_FAILED',
  'CONFLICT',
  'FORBIDDEN',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'UNAVAILABLE',
] as const;
const KNOWN_VIOLATIONS = ['TOO_SHORT', 'SAME_AS_EMAIL', 'LOW_VARIETY'] as const;

type KnownCode = (typeof KNOWN_CODES)[number] | (typeof KNOWN_VIOLATIONS)[number];
export type ErrorKey = `errors.${KnownCode}` | 'errors.generic' | 'errors.network';

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

/** Translation key for an error: specific when known, generic otherwise. */
export function errorKey(error: unknown): ErrorKey {
  if (!(error instanceof ApiError)) return 'errors.generic';
  if (error.code === 'NETWORK') return 'errors.network';
  const violations = error.details.violations;
  if (Array.isArray(violations) && isOneOf(KNOWN_VIOLATIONS, violations[0])) {
    return `errors.${violations[0]}`;
  }
  return isOneOf(KNOWN_CODES, error.code) ? `errors.${error.code}` : 'errors.generic';
}
