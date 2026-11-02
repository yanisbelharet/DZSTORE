import { corePackage } from '@dz/core';

/** Identité du package (squelette P0-01, remplacé par le vrai contenu dans les tâches suivantes). */
export const dbPackage = {
  name: '@dz/db',
  dependsOn: [corePackage.name],
} as const;
