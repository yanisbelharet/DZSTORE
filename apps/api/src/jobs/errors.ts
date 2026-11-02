/** Throw from a job handler: the job goes to the dead-letter state without retrying. */
export class NonRetryableJobError extends Error {
  override readonly name = 'NonRetryableJobError';
}

/** Throw from a job handler to retry later (e.g. HTTP 429 Retry-After) without using an attempt. */
export class RetryLaterError extends Error {
  override readonly name = 'RetryLaterError';
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}
