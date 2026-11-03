import { corePackage } from '@dz/core';

export * from './errors.ts';
export * from './stores.ts';

/** Identité du package (squelette P0-01). */
export const contractsPackage = {
  name: '@dz/contracts',
  dependsOn: [corePackage.name],
} as const;
