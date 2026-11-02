import { contractsPackage } from '@dz/contracts';

/** Identité du package (squelette P0-01, remplacé par le vrai contenu dans les tâches suivantes). */
export const storePackage = {
  name: '@dz/store',
  dependsOn: [contractsPackage.name],
} as const;
