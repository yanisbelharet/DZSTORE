import { contractsPackage } from '@dz/contracts';
import { corePackage } from '@dz/core';
import { dbPackage } from '@dz/db';
import { domainPackage } from '@dz/domain';

export { buildApp } from './app.ts';
export type { App, AppDependencies } from './app.ts';

/** Identité du package. */
export const apiPackage = {
  name: '@dz/api',
  dependsOn: [corePackage.name, dbPackage.name, domainPackage.name, contractsPackage.name],
} as const;
