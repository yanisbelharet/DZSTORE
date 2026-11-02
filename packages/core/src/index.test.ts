import { describe, expect, it } from 'vitest';

import { corePackage } from './index.ts';

describe('@dz/core', () => {
  it('expose son identité', () => {
    expect(corePackage.name).toBe('@dz/core');
  });
});
