/**
 * Application errors with stable codes. The client translates by `code`; `message` is meant for
 * developers and logs and is only exposed for client errors (4xx).
 * Feature tasks add their own codes to ERROR_CODES (e.g. ORDER_TRANSITION_FORBIDDEN).
 */
export const ERROR_CODES = {
  BAD_REQUEST: { status: 400 },
  VALIDATION_FAILED: { status: 422 },
  UNAUTHENTICATED: { status: 401 },
  FORBIDDEN: { status: 403 },
  NOT_FOUND: { status: 404 },
  CONFLICT: { status: 409 },
  RATE_LIMITED: { status: 429 },
  INTERNAL: { status: 500 },
  INVALID_CONFIGURATION: { status: 500 },
  SECRET_DECRYPTION_FAILED: { status: 500 },
  UNAVAILABLE: { status: 503 },
} as const satisfies Record<string, { status: number }>;

export type ErrorCode = keyof typeof ERROR_CODES;

export type ErrorDetails = Readonly<Record<string, unknown>>;

export interface AppErrorOptions {
  details?: ErrorDetails;
  cause?: unknown;
}

export interface SerializedAppError {
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
}

export class AppError extends Error {
  override readonly name = 'AppError';
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetails | undefined;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.details = options.details;
  }

  /** Client errors (4xx) may show their message; server errors never do. */
  get expose(): boolean {
    return this.status < 500;
  }

  /** Safe payload for API responses: never includes the cause or the stack. */
  toJSON(): SerializedAppError {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
