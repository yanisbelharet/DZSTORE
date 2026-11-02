import { describe, expect, it } from 'vitest';

import { isUuidV7, newId } from './ids.ts';

describe('ids — UUIDv7', () => {
  it('génère des UUIDv7 valides', () => {
    const id = newId();
    expect(isUuidV7(id)).toBe(true);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });

  it('les identifiants successifs sont triés dans l’ordre de création', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejette ce qui n’est pas un UUIDv7', () => {
    expect(isUuidV7('550e8400-e29b-41d4-a716-446655440000')).toBe(false); // v4
    expect(isUuidV7('pas-un-uuid')).toBe(false);
  });
});
