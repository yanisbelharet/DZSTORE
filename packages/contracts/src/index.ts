import { corePackage } from '@dz/core';

/** Identité du package (squelette P0-01, remplacé par le vrai contenu dans les tâches suivantes). */
export const contractsPackage = {
  name: '@dz/contracts',
  dependsOn: [corePackage.name],
} as const;
