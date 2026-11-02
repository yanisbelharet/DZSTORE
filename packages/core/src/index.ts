// Pure, runtime-agnostic exports (usable by the domain and the browser).
// Server-only modules are imported by subpath: '@dz/core/env', '@dz/core/logger',
// '@dz/core/crypto'; identifiers by '@dz/core/ids'.
export * from './errors.ts';
export * from './money.ts';
export * from './time.ts';

export const corePackage = {
  name: '@dz/core',
  dependsOn: [],
} as const;
