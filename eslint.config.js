// Configuration ESLint (flat config) de tout le monorepo.
// Les règles de dépendance entre packages reproduisent ARCHITECTURE.md §1 ;
// elles sont prouvées par tooling/src/lint-rules.test.ts.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ARCHI = 'voir docs/ARCHITECTURE.md §1';

/** Aucune application ne doit être importée (ni par un package, ni par une autre application). */
const NO_APPS = {
  group: ['@dz/api', '@dz/api/*', '@dz/admin', '@dz/admin/*', '@dz/store', '@dz/store/*'],
  message: `Une application ne s'importe jamais depuis un package ou une autre application (${ARCHI}).`,
};
/** Interdit de franchir une frontière de package par un chemin relatif. */
const NO_RELATIVE_CROSS_PACKAGE = {
  regex: String.raw`^(\.\./)+(apps|packages|tooling)/`,
  message: `Importer un autre package par son nom (@dz/…), jamais par un chemin relatif (${ARCHI}).`,
};
const NO_DB = {
  group: ['@dz/db', '@dz/db/*', '@prisma/*', 'pg', 'pg-boss'],
  message: `Accès base de données interdit ici (${ARCHI}).`,
};
const NO_DOMAIN = {
  group: ['@dz/domain', '@dz/domain/*'],
  message: `Logique métier réservée à l'API (${ARCHI}).`,
};
const NO_IO_MODULES = {
  group: [
    'fs',
    'fs/*',
    'node:fs',
    'node:fs/*',
    'net',
    'node:net',
    'http',
    'node:http',
    'https',
    'node:https',
    'http2',
    'node:http2',
    'dns',
    'node:dns',
    'tls',
    'node:tls',
    'dgram',
    'node:dgram',
    'child_process',
    'node:child_process',
    'undici',
    'axios',
    'node-fetch',
  ],
  message: `Le domaine est pur : aucune entrée/sortie (fichiers, réseau, processus) (${ARCHI}).`,
};

/** Modules de @dz/core réservés au serveur (Node) : configuration, logs, chiffrement. */
const NO_SERVER_CORE = {
  group: ['@dz/core/env', '@dz/core/logger', '@dz/core/crypto'],
  message: `Module serveur de @dz/core : interdit dans le domaine et le navigateur (${ARCHI}).`,
};
const NO_CORE_IDS = {
  group: ['@dz/core/ids'],
  message: `Le domaine reçoit ses identifiants en paramètre, il ne les génère pas (${ARCHI}).`,
};

/** @param {...object} patterns */
const restrictImports = (...patterns) => ({
  'no-restricted-imports': [
    'error',
    { patterns: [NO_RELATIVE_CROSS_PACKAGE, NO_APPS, ...patterns] },
  ],
});

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.astro/**',
      '**/src/generated/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Fichiers JavaScript de configuration : hors projets TypeScript.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/**', 'packages/**', 'tooling/**'],
    rules: restrictImports(),
  },
  {
    files: ['apps/store/**', 'apps/admin/**'],
    rules: restrictImports(NO_DB, NO_DOMAIN, NO_SERVER_CORE),
  },
  {
    files: ['packages/core/**'],
    rules: restrictImports({
      group: [
        '@dz/db',
        '@dz/db/*',
        '@dz/domain',
        '@dz/domain/*',
        '@dz/contracts',
        '@dz/contracts/*',
      ],
      message: `@dz/core est le socle : il ne dépend d'aucun autre package (${ARCHI}).`,
    }),
  },
  {
    files: ['packages/db/**'],
    rules: restrictImports(NO_DOMAIN),
  },
  {
    files: ['packages/contracts/**'],
    rules: restrictImports(NO_DB, NO_DOMAIN),
  },
  {
    files: ['packages/domain/**'],
    rules: {
      ...restrictImports(NO_DB, NO_IO_MODULES, NO_SERVER_CORE, NO_CORE_IDS),
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Le domaine est pur : pas de réseau.' },
        { name: 'XMLHttpRequest', message: 'Le domaine est pur : pas de réseau.' },
        { name: 'WebSocket', message: 'Le domaine est pur : pas de réseau.' },
        {
          name: 'process',
          message:
            "Le domaine reçoit sa configuration en paramètre, jamais depuis l'environnement.",
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: "L'heure est injectée (paramètre `now`)." },
        { object: 'Math', property: 'random', message: "L'aléatoire est injecté." },
        { object: 'crypto', property: 'randomUUID', message: 'Les identifiants sont injectés.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            "L'heure est injectée (paramètre `now`) : `new Date()` sans argument est interdit.",
        },
      ],
    },
  },
  {
    files: ['apps/admin/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: globals.browser },
    rules: {
      // TanStack Router's documented API: `throw redirect(...)` (a Response, not an Error).
      '@typescript-eslint/only-throw-error': [
        'error',
        { allow: [{ from: 'package', package: '@tanstack/router-core', name: 'Redirect' }] },
      ],
    },
  },
  {
    // Tooling files of the admin (Vite, Playwright, e2e): typechecked by tsconfig.node.json.
    // End-to-end tests prepare their own database, hence the database import.
    files: ['apps/admin/*.config.ts', 'apps/admin/e2e/**/*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
    rules: restrictImports(),
  },
  prettier,
);
