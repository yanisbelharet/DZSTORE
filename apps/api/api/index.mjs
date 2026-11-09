// Vercel Function serving every request of the API project (vercel.json rewrites all paths
// here; the original URL is kept). The bundle is produced at deploy time by
// `pnpm vercel-build` (scripts/bundle-vercel.ts, ADR-0025).
export { default } from '../.vercel-build/server.mjs';
