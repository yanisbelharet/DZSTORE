import { corePackage } from '@dz/core';

export * from './rbac.ts';

/** Identité du package. */
export const domainPackage = {
  name: '@dz/domain',
  dependsOn: [corePackage.name],
} as const;
