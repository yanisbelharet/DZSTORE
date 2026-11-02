import { corePackage } from '@dz/core';

/** Identité du package (squelette P0-01, remplacé par le vrai contenu dans les tâches suivantes). */
export const domainPackage = {
  name: '@dz/domain',
  dependsOn: [corePackage.name],
} as const;
