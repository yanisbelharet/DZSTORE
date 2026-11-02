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

## Base de données locale
```bash
pnpm db:local     # démarre PostgreSQL et crée dz_dev + dz_test (idempotent)
cp .env.example .env
```
Avec Docker (démon actif), le script lance PostgreSQL 17 via `docker-compose.yml` ; sinon il
utilise un PostgreSQL natif (Debian/Ubuntu). La CI utilise PostgreSQL 17.

## Intégration continue
GitHub Actions (`.github/workflows/ci.yml`) lance format, lint, typecheck, tests et build à
chaque push et pull request, avec un service PostgreSQL 17.

## Commandes
| Commande | Rôle |
|---|---|
| `pnpm dev` | lance les applications en développement |
| `pnpm lint` | ESLint (règles typées + frontières entre packages) |
| `pnpm typecheck` | TypeScript strict, package par package |
| `pnpm test` | tests Vitest de tous les packages |
| `pnpm build` | compilation des applications |
| `pnpm format` | formatage Prettier |
| `pnpm db:local` | PostgreSQL local + bases `dz_dev` et `dz_test` |

## Structure
```
apps/       api (HTTP + worker), admin (OMS), store (boutique)
packages/   core, db, domain, contracts, config
tooling/    tests de l'outillage (règles de lint)
docs/       PRD, architecture, roadmap, décisions, intégrations
```
