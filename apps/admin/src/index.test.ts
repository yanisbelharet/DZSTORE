import { describe, expect, it } from 'vitest';

import { adminPackage } from './index.ts';

describe('@dz/admin', () => {
  it('expose son identité', () => {
    expect(adminPackage.name).toBe('@dz/admin');
  });

  it('résout ses dépendances internes depuis leurs sources TypeScript', () => {
    expect(adminPackage.dependsOn).toEqual(['@dz/contracts']);
  });
});
