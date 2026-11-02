import { describe, expect, it } from 'vitest';

import { apiPackage } from './index.ts';

describe('@dz/api', () => {
  it('expose son identité', () => {
    expect(apiPackage.name).toBe('@dz/api');
  });

  it('résout ses dépendances internes depuis leurs sources TypeScript', () => {
    expect(apiPackage.dependsOn).toEqual(['@dz/core', '@dz/db', '@dz/domain', '@dz/contracts']);
  });
});
