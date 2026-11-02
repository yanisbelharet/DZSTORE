import { describe, expect, it } from 'vitest';

import { contractsPackage } from './index.ts';

describe('@dz/contracts', () => {
  it('expose son identité', () => {
    expect(contractsPackage.name).toBe('@dz/contracts');
  });

  it('résout ses dépendances internes depuis leurs sources TypeScript', () => {
    expect(contractsPackage.dependsOn).toEqual(['@dz/core']);
  });
});
