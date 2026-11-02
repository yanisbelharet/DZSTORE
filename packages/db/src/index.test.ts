import { describe, expect, it } from 'vitest';

import { dbPackage } from './index.ts';

describe('@dz/db', () => {
  it('expose son identité', () => {
    expect(dbPackage.name).toBe('@dz/db');
  });

  it('résout ses dépendances internes depuis leurs sources TypeScript', () => {
    expect(dbPackage.dependsOn).toEqual(['@dz/core']);
  });
});
