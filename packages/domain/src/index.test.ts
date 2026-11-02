import { describe, expect, it } from 'vitest';

import { domainPackage } from './index.ts';

describe('@dz/domain', () => {
  it('expose son identité', () => {
    expect(domainPackage.name).toBe('@dz/domain');
  });

  it('résout ses dépendances internes depuis leurs sources TypeScript', () => {
    expect(domainPackage.dependsOn).toEqual(['@dz/core']);
  });
});
