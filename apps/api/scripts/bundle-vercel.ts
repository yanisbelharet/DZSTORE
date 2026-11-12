// Bundles the serverless entry point into one ESM file for the Vercel test environment
// (ADR-0025). The VPS production server keeps running the TypeScript sources (ADR-0022).
// Everything is bundled except native modules, which Vercel's file tracing ships from
// node_modules (the API depends on them directly).
import path from 'node:path';

import { build } from 'vite';

const apiRoot = path.resolve(import.meta.dirname, '..');
export const VERCEL_BUNDLE_DIR = '.vercel-build';

await build({
  configFile: false,
  root: apiRoot,
  // `public/` belongs to the Vercel project (robots.txt), not to the bundle.
  publicDir: false,
  logLevel: 'warn',
  build: {
    ssr: 'src/serverless.ts',
    outDir: VERCEL_BUNDLE_DIR,
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      output: { entryFileNames: 'server.mjs', format: 'es', codeSplitting: false },
    },
  },
  ssr: {
    target: 'node',
    noExternal: true,
    // Native addons (prebuilt per platform) and pg's optional native driver (unused).
    external: ['@node-rs/argon2', 'sharp', 'pg-native'],
  },
});
process.stdout.write(`Serverless bundle written to ${VERCEL_BUNDLE_DIR}/server.mjs\n`);
