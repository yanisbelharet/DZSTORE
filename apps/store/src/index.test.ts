import { describe, expect, it } from 'vitest';

import { storePackage } from './index.ts';

describe('@dz/store', () => {
  it('expose son identité', () => {
    expect(storePackage.name).toBe('@dz/store');
  });

  it('résout ses dépendances internes depuis leurs sources TypeScript', () => {
    expect(storePackage.dependsOn).toEqual(['@dz/contracts']);
  });
});
