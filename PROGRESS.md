# PROGRESS — DZ Commerce OS

> État vivant du projet. Lu au début de chaque session (`/reprendre`), mis à jour à la fin de
> chaque tâche (`/tache`) et de chaque session (`/fin-session`).

## État actuel
- **Phase** : 0 — Fondations (en cours : 2/12 tâches).
- **Session 1 (2026-11-01/02)** : cadrage terminé, kit reconstruit, architecture rédigée,
  **validés par le propriétaire le 2026-11-02**.
- **En cours** : —
- **Prochaine action** : `/tache P0-03` (package `core`) — plan à soumettre.

## File d'attente — Phase 0 (détails et critères : `docs/ROADMAP.md`)
1. ~~P0-01 — Monorepo et outillage qualité~~ ✅
2. ~~P0-02 — Environnement local et intégration continue~~ ✅
3. P0-03 — Package `core` (env, logger avec rédaction, erreurs, ids, crypto, argent, temps)
4. P0-04 — Package `db` : Prisma et schéma socle
5. P0-05 — API HTTP : squelette Fastify
6. P0-06 — Authentification (sessions, Argon2id, TOTP, limitation de débit)
7. P0-07 — RBAC, périmètre boutique, audit, gestion des utilisateurs
8. P0-08 — Worker : jobs, outbox, retries, dead-letter
9. P0-09 — Admin : coquille (fr/en, connexion + 2FA, utilisateurs, palette)
10. P0-10 — Store : coquille (résolution par hôte, ar RTL / fr, budgets Lighthouse)
11. P0-11 — Seed déterministe et fabriques de test
12. P0-12 — Déploiement de test sur Vercel + Neon (prérequis : comptes créés par le propriétaire)
13. Checkpoint 0 (`/checkpoint`, tag `cp-0`)

## Terminé
| Date | Élément | Commit |
|---|---|---|
| 2026-11-02 | **P0-02** — CI GitHub Actions (format, lint, typecheck, tests, build, service PostgreSQL 17, actions épinglées par SHA) ; `pnpm db:local` (Docker ou PostgreSQL natif, bases `dz_dev`/`dz_test`, idempotent) ; **CI run n°1 verte en 52 s** (37 tests exécutés, PostgreSQL 17.11) | `a15d448` |
| 2026-11-02 | **P0-01** — monorepo pnpm + Turborepo, TypeScript 6 strict, ESLint 10 typé + frontières entre packages (24 tests), Prettier, squelettes des 7 packages/apps, Node 24 imposé ; `pnpm check` vert, clone neuf vérifié | `39bd432` |
| 2026-11-02 | Session 1 — kit reconstruit (CLAUDE.md, PRD, ROADMAP, DECISIONS, 11 skills, doc EcoTrack + snapshot officiel), ARCHITECTURE.md (schéma Prisma validé, diagrammes Mermaid vérifiés) | voir `git log` |

## Décisions de la session 1 (détail : PRD §26, DECISIONS.md)
- Plusieurs boutiques (`storeId` partout) · hébergement : test gratuit sur Vercel + Neon, production
  sur VPS avant toute vente · admin fr + en · paie fixe par commande livrée · pas de reprise de
  données · push après chaque commit sur la branche de travail.
- Doc EcoTrack officielle (Postman) figée en snapshot daté ; 🔶 à vérifier sur le compte réel.

## Validé par le propriétaire (2026-11-02)
- Hébergement (ADR-0013) : test gratuit Vercel + Neon (P0-12), production VPS avant toute vente.
- Store Astro (ADR-0002), jobs sur PostgreSQL sans Redis (ADR-0006, ADR-0020).
- Ordre de la roadmap (mise en production après P6) et hypothèses [H] du PRD §26.
- Mode de travail : règle de `CLAUDE.md` inchangée — plan soumis si > 3 fichiers, schéma DB
  ou API publique ; le propriétaire peut demander d'« enchaîner » à tout moment.

## À valider par le propriétaire
- Rien en attente.

## Pièges et notes techniques
- Le serveur MCP GitHub ne s'est pas connecté dans la session 1 ; `git push` fonctionne.
- Conteneur cloud éphémère : tout doit être commité **et poussé** avant la fin d'une session.
- Node 22 par défaut dans le conteneur : Node 24.22.2 installé via nvm ; **préfixer chaque
  commande** par `export PATH=/root/.nvm/versions/node/v24.22.2/bin:$PATH` (pnpm 10.28 y est
  installé). Avec Node 22, `pnpm install` est refusé (engine-strict) — c'est voulu.
- `pnpm build` n'exécute encore aucune tâche : aucune application n'est compilable avant P0-05
  (API), P0-09 (admin), P0-10 (store).
- Prettier ignore volontairement le Markdown (tableaux et diagrammes maintenus à la main).
- Démon Docker **absent** du conteneur (client seul) ; **PostgreSQL 16 natif** → `pnpm db:local`
  le démarre et crée `dz_dev`/`dz_test` (à relancer à chaque nouvelle session : le cluster est
  arrêté au démarrage du conteneur) ; CI et production en PostgreSQL 17.
- CI : résultat lisible via le connecteur GitHub (`actions_list` / `get_job_logs`). Les outils
  binaires externes téléchargés (ex. actionlint) sont bloqués par les garde-fous de la session.
- TypeScript 7 publié mais non supporté par typescript-eslint (< 6.1) → TypeScript 6.0.x.
- Argon2 : `@node-rs/argon2` (binaires précompilés, dont linux-arm64, sans node-gyp).
- Production possiblement en **ARM64** (si Oracle) : vérifier dès P0-01 que Prisma, sharp et
  argon2 fournissent des binaires linux/arm64 ; images construites pour amd64 et arm64.
- Code portable test/production : adaptateur Astro, point d'entrée Fastify et mode des jobs
  (boucle/tick, ADR-0020) choisis par configuration — jamais de logique spécifique à Vercel.
