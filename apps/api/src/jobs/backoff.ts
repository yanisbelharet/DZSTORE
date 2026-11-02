/** Retry delay after `attempt` failures: 30 s × 2^(n−1), capped at 1 h, ± 20 % jitter. */
export const BACKOFF = { baseMs: 30_000, maxMs: 3_600_000, jitter: 0.2 } as const;

export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(BACKOFF.baseMs * 2 ** Math.max(0, attempt - 1), BACKOFF.maxMs);
  const factor = 1 + (random() * 2 - 1) * BACKOFF.jitter;
  return Math.round(exponential * factor);
}
