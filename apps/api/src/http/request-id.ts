import { newId } from '@dz/core/ids';

const INCOMING_REQUEST_ID = /^[\w.-]{8,64}$/u;

/** Reuses a well-formed incoming `x-request-id` (edge/proxy correlation), otherwise a UUIDv7. */
export function requestIdFrom(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value !== undefined && INCOMING_REQUEST_ID.test(value) ? value : newId();
}
