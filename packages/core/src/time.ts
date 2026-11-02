import { AppError } from './errors.ts';

/** Business time zone. Stored instants are UTC; days and reports use Algiers local time. */
export const ALGIERS_TIME_ZONE = 'Africa/Algiers';

/** Injectable clock: business code never reads the current time implicitly. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export interface FixedClock extends Clock {
  set(at: Date | string): void;
  advance(milliseconds: number): void;
}

/** Deterministic clock for tests and replays. Returned dates are copies. */
export function fixedClock(at: Date | string): FixedClock {
  let current = new Date(at).getTime();
  return {
    now: () => new Date(current),
    set: (next) => {
      current = new Date(next).getTime();
    },
    advance: (milliseconds) => {
      current += milliseconds;
    },
  };
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ALGIERS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ALGIERS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Local Algiers day of an instant, as `YYYY-MM-DD`. */
export function algiersDate(at: Date): string {
  return dayFormatter.format(at);
}

/** Offset (minutes) of Algiers local time relative to UTC at a given instant. */
function algiersOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(at).map((part) => [part.type, part.value]),
  );
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((localAsUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** UTC bounds `[start, end)` of an Algiers local day `YYYY-MM-DD`. */
export function algiersDayRange(day: string): { start: Date; end: Date } {
  const match = DAY_PATTERN.exec(day);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const date = Number(match?.[3]);
  const midnightUtc = Date.UTC(year, month - 1, date);
  if (!match || new Date(midnightUtc).toISOString().slice(0, 10) !== day) {
    throw new AppError('VALIDATION_FAILED', 'Day must be a valid YYYY-MM-DD date', {
      details: { reason: 'INVALID_DAY' },
    });
  }
  const startOf = (utcMidnight: number) =>
    new Date(utcMidnight - algiersOffsetMinutes(new Date(utcMidnight)) * 60_000);
  return { start: startOf(midnightUtc), end: startOf(midnightUtc + 86_400_000) };
}
