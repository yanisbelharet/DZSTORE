# DZ Commerce OS

Système e-commerce COD (Algérie) : store multi-boutiques, OMS, transporteurs, stock, agents,
pixels, statistiques. Documentation : [`docs/`](docs/) — commencer par `CLAUDE.md` et
`PROGRESS.md`.

## Prérequis
- **Node 24** (`nvm use` lit `.nvmrc`) — l'installation est refusée avec une autre version.
- **pnpm 10.28** (`corepack enable` ou `npm i -g pnpm@10.28.0`).

## Démarrage
```bash
pnpm install
pnpm check        # format, lint, typecheck, tests, build
```

## Commandes
| Commande | Rôle |
|---|---|
| `pnpm dev` | lance les applications en développement |
| `pnpm lint` | ESLint (règles typées + frontières entre packages) |
| `pnpm typecheck` | TypeScript strict, package par package |
| `pnpm test` | tests Vitest de tous les packages |
| `pnpm build` | compilation des applications |
| `pnpm format` | formatage Prettier |

## Structure
```
apps/       api (HTTP + worker), admin (OMS), store (boutique)
packages/   core, db, domain, contracts, config
tooling/    tests de l'outillage (règles de lint)
docs/       PRD, architecture, roadmap, décisions, intégrations
```
