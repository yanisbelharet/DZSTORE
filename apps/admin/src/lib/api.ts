import { apiErrorSchema } from '@dz/contracts';

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

/**
 * Calls the API on the same origin (`/api`, ADR-0021) with the session cookie and the anti-CSRF
 * header. Throws `ApiError` (code from the API) or `ApiError('NETWORK')` when unreachable.
 */
export async function api<T>(
  path: string,
  { method = 'GET', body, signal }: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'x-dz-csrf': '1',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK', 'Network error');
  }
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(response.status, code, message, details ?? {});
    }
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
