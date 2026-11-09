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

## Données de démo (local)
```bash
pnpm db:deploy            # applique les migrations sur dz_dev
pnpm db:seed              # boutiques et comptes de démo (idempotent : relançable sans risque)
pnpm db:seed --reset      # vide d'abord toutes les tables — base locale uniquement
```
Le seed est **refusé** si `NODE_ENV=production`. Toutes les données sont fictives.

| Boutique | Adresse locale | Langues |
|---|---|---|
| Beauté Démo (`demo-beaute`) | `http://beaute.localhost:4321` | arabe (défaut), français (`/fr/`) |
| Maison Démo (`demo-maison`) | `http://maison.localhost:4321` | arabe |

Mot de passe de **tous** les comptes de démo : `demo-password-2026`.

| Compte | Rôle | Boutiques | 2FA (secret TOTP à saisir dans l'application d'authentification) |
|---|---|---|---|
| `owner@demo.test` | Propriétaire | toutes | `OWNERDEMOTOTPSECRETDZCOMMERCEOS2` |
| `admin@demo.test` | Admin | toutes | `ADMINDEMOTOTPSECRETDZCOMMERCEOS3` |
| `confirmation1@demo.test` | Agent confirmation | Beauté, Maison | — |
| `confirmation2@demo.test` | Agent confirmation (admin en anglais) | Beauté | — |
| `suivi@demo.test` | Agent suivi | Maison | — |
| `mixte@demo.test` | Agent confirmation + suivi | Beauté | — |

Ces identifiants sont **publics** : ils ne sont appliqués que sur une base locale
(`localhost`). Sur une autre base (environnement de test Neon), le seed exige
`SEED_DEMO_PASSWORD` et n'enrôle aucune 2FA (enrôlement à la première connexion).

Lancer l'ensemble en local : `pnpm dev` (API + worker sur http://localhost:3000, admin sur
http://localhost:5173, store sur http://beaute.localhost:4321 et http://maison.localhost:4321).

## Environnement de test en ligne
Gratuit et non commercial (Vercel + Neon) : guide pas à pas dans
[`docs/deploiement-test.md`](docs/deploiement-test.md).

## Intégration continue
GitHub Actions (`.github/workflows/ci.yml`) lance format, lint, typecheck, tests et build à
chaque push et pull request, avec un service PostgreSQL 17, puis les e2e Playwright (admin,
store) et les budgets Lighthouse du store.

## Commandes
| Commande | Rôle |
|---|---|
| `pnpm dev` | API + worker, admin et store en développement (rechargement à chaud) |
| `pnpm lint` | ESLint (règles typées + frontières entre packages) |
| `pnpm typecheck` | TypeScript strict, package par package |
| `pnpm test` | tests Vitest de tous les packages |
| `pnpm build` | compilation des applications |
| `pnpm format` | formatage Prettier |
| `pnpm db:local` | PostgreSQL local + bases `dz_dev` et `dz_test` |
| `pnpm db:seed` | données de démo (boutiques, comptes ; `--reset` en local) |
| `pnpm test:e2e` | e2e Playwright admin + store et budgets Lighthouse |

## Structure
```
apps/       api (HTTP + worker), admin (OMS), store (boutique)
packages/   core, db, domain, contracts, config
tooling/    tests de l'outillage (règles de lint)
docs/       PRD, architecture, roadmap, décisions, intégrations
```
