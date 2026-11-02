import { v7, validate, version } from 'uuid';

/** New time-ordered identifier (UUIDv7, ADR-0005). */
export function newId(): string {
  return v7();
}

export function isUuidV7(value: string): boolean {
  return validate(value) && version(value) === 7;
}
