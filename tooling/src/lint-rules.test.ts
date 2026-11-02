// Prouve que les règles de dépendance entre packages (docs/ARCHITECTURE.md §1) sont appliquées
// par ESLint : chaque cas lint un extrait de code comme s'il se trouvait à l'emplacement indiqué.
import path from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');

// Les règles testées sont des règles ESLint de base : l'analyse typée est inutile ici et
// impossible pour des fichiers virtuels.
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfig: tseslint.configs.disableTypeChecked,
});

async function ruleIdsFor(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, file) });
  if (!result) throw new Error(`Aucun résultat de lint pour ${file}`);
  return result.messages.map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

const BOUNDARY_RULES = new Set([
  'no-restricted-imports',
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-syntax',
]);

async function boundaryViolations(file: string, code: string): Promise<string[]> {
  const ids = await ruleIdsFor(file, code);
  const fatal = ids.filter((id) => id.startsWith('fatal'));
  if (fatal.length > 0) throw new Error(`Erreur d'analyse : ${fatal.join(', ')}`);
  return ids.filter((id) => BOUNDARY_RULES.has(id));
}

const use = (expr: string) => `export const probe = ${expr};\n`;

describe('règles de dépendance entre packages', () => {
  describe('violations détectées', () => {
    it.each([
      ['packages/domain/src/x.ts', "import { dbPackage } from '@dz/db';\n" + use('dbPackage')],
      [
        'packages/domain/src/x.ts',
        "import { readFileSync } from 'node:fs';\n" + use('readFileSync'),
      ],
      [
        'packages/domain/src/x.ts',
        "import { PrismaClient } from '@prisma/client';\n" + use('PrismaClient'),
      ],
      ['packages/domain/src/x.ts', "import { apiPackage } from '@dz/api';\n" + use('apiPackage')],
      [
        'packages/db/src/x.ts',
        "import { domainPackage } from '@dz/domain';\n" + use('domainPackage'),
      ],
      ['packages/core/src/x.ts', "import { dbPackage } from '@dz/db';\n" + use('dbPackage')],
      [
        'packages/contracts/src/x.ts',
        "import { domainPackage } from '@dz/domain';\n" + use('domainPackage'),
      ],
      ['apps/store/src/x.ts', "import { dbPackage } from '@dz/db';\n" + use('dbPackage')],
      [
        'apps/store/src/x.ts',
        "import { domainPackage } from '@dz/domain';\n" + use('domainPackage'),
      ],
      ['apps/admin/src/x.ts', "import { apiPackage } from '@dz/api';\n" + use('apiPackage')],
      ['apps/api/src/x.ts', "import { storePackage } from '@dz/store';\n" + use('storePackage')],
      [
        'apps/api/src/x.ts',
        "import { domainPackage } from '../../../packages/domain/src/index.ts';\n" +
          use('domainPackage'),
      ],
      // Modules serveur de @dz/core (et génération d'identifiants pour le domaine)
      [
        'packages/domain/src/x.ts',
        "import { createLogger } from '@dz/core/logger';\n" + use('createLogger'),
      ],
      [
        'packages/domain/src/x.ts',
        "import { sha256Hex } from '@dz/core/crypto';\n" + use('sha256Hex'),
      ],
      ['packages/domain/src/x.ts', "import { loadEnv } from '@dz/core/env';\n" + use('loadEnv')],
      ['packages/domain/src/x.ts', "import { newId } from '@dz/core/ids';\n" + use('newId')],
      [
        'apps/admin/src/x.ts',
        "import { createSecretBox } from '@dz/core/crypto';\n" + use('createSecretBox'),
      ],
      [
        'apps/store/src/x.ts',
        "import { createLogger } from '@dz/core/logger';\n" + use('createLogger'),
      ],
    ])('%s : import interdit', async (file, code) => {
      expect(await boundaryViolations(file, code)).toEqual(['no-restricted-imports']);
    });

    it.each([
      ['fetch', use("fetch('https://example.test')")],
      ['process.env', use('process.env')],
      ['Date.now()', use('Date.now()')],
      ['new Date()', use('new Date()')],
      ['Math.random()', use('Math.random()')],
    ])('domaine pur : %s interdit', async (_label, code) => {
      expect(await boundaryViolations('packages/domain/src/x.ts', code)).toHaveLength(1);
    });
  });

  describe('usages autorisés', () => {
    it.each([
      [
        'packages/domain/src/x.ts',
        "import { corePackage } from '@dz/core';\n" + use('corePackage'),
      ],
      ['packages/domain/src/x.ts', use("new Date('2026-01-01T00:00:00Z')")],
      ['packages/db/src/x.ts', "import { corePackage } from '@dz/core';\n" + use('corePackage')],
      ['apps/api/src/x.ts', "import { domainPackage } from '@dz/domain';\n" + use('domainPackage')],
      ['apps/api/src/x.ts', "import { dbPackage } from '@dz/db';\n" + use('dbPackage')],
      [
        'apps/store/src/x.ts',
        "import { contractsPackage } from '@dz/contracts';\n" + use('contractsPackage'),
      ],
      ['apps/api/src/x.ts', use("fetch('https://example.test')")],
      // Parties pures de @dz/core
      ['packages/domain/src/x.ts', "import { dzd } from '@dz/core/money';\n" + use('dzd')],
      [
        'packages/domain/src/x.ts',
        "import { algiersDate } from '@dz/core';\n" + use('algiersDate'),
      ],
      ['apps/store/src/x.ts', "import { formatDzd } from '@dz/core/money';\n" + use('formatDzd')],
      ['apps/admin/src/x.ts', "import { newId } from '@dz/core/ids';\n" + use('newId')],
      [
        'apps/api/src/x.ts',
        "import { createLogger } from '@dz/core/logger';\n" + use('createLogger'),
      ],
    ])('%s : autorisé', async (file, code) => {
      expect(await boundaryViolations(file, code)).toEqual([]);
    });
  });
});
