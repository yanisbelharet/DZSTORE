import { corePackage } from '@dz/core';
import { dbPackage } from '@dz/db';
import { domainPackage } from '@dz/domain';
import { contractsPackage } from '@dz/contracts';

/** Identité du package (squelette P0-01, remplacé par le vrai contenu dans les tâches suivantes). */
export const apiPackage = {
  name: '@dz/api',
  dependsOn: [corePackage.name, dbPackage.name, domainPackage.name, contractsPackage.name],
} as const;
