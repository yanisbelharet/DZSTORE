# PROGRESS — DZ Commerce OS

> État vivant du projet. Lu au début de chaque session (`/reprendre`), mis à jour à la fin de
> chaque tâche (`/tache`) et de chaque session (`/fin-session`).

## État actuel
- **Phase** : 0 — Fondations (en cours : 8/12 tâches).
- **Mode** : enchaînement autonome de la Phase 0 sans validation des plans (accord du propriétaire
  le 2026-11-02) ; arrêt uniquement sur blocage ou décision qui lui revient.
- **Session 1 (2026-11-01/02)** : cadrage terminé, kit reconstruit, architecture rédigée,
  **validés par le propriétaire le 2026-11-02**.
- **En cours** : —
- **Prochaine action** : `/tache P0-09` (admin : coquille).

## File d'attente — Phase 0 (détails et critères : `docs/ROADMAP.md`)
1. ~~P0-01 — Monorepo et outillage qualité~~ ✅
2. ~~P0-02 — Environnement local et intégration continue~~ ✅
3. ~~P0-03 — Package `core` (env, logger avec rédaction, erreurs, ids, crypto, argent, temps)~~ ✅
4. ~~P0-04 — Package `db` : Prisma et schéma socle~~ ✅
5. ~~P0-05 — API HTTP : squelette Fastify~~ ✅
6. ~~P0-06 — Authentification (sessions, Argon2id, TOTP, limitation de débit)~~ ✅
7. ~~P0-07 — RBAC, périmètre boutique, audit, gestion des utilisateurs~~ ✅
8. ~~P0-08 — Worker : jobs, outbox, retries, dead-letter~~ ✅
9. P0-09 — Admin : coquille (fr/en, connexion + 2FA, utilisateurs, palette)
10. P0-10 — Store : coquille (résolution par hôte, ar RTL / fr, budgets Lighthouse)
11. P0-11 — Seed déterministe et fabriques de test
12. P0-12 — Déploiement de test sur Vercel + Neon (prérequis : comptes créés par le propriétaire)
13. Checkpoint 0 (`/checkpoint`, tag `cp-0`)

## Terminé
| Date | Élément | Commit |
|---|---|---|
| 2026-11-02 | **P0-08** — File de jobs PostgreSQL maison (ADR-0023, remplace pg-boss) : diffusion outbox exactement une fois, backoff + jitter, dead-letter, report sans essai consommé, clé de concurrence (index unique partiel), bail, tâches planifiées, `runTick` (worker en boucle + `/v1/internal/tick`), admin des jobs en échec ; worker réel vérifié | voir `git log` |
| 2026-11-02 | **P0-07** — RBAC : matrice du domaine (23 permissions × 4 rôles), règle d'accès obligatoire sur chaque route `/v1` (sinon démarrage refusé), contrôle en `onRequest` (403 avant validation), test automatique routes × rôles (prouvé par mutation) ; périmètre boutique dans la session ; gestion des comptes (ADMIN ne gère que les agents, révocation des sessions sur changement de droits) ; journal d'audit consultable ; script `create-owner` ; 203 tests | voir `git log` |
| 2026-11-02 | **P0-06** — Auth : Argon2id (OWASP), sessions opaques hachées (cookie `__Host-` / Bearer mobile, liées au canal), inactivité 12 h / 7 j « se souvenir », absolue 30 j, révocation, verrouillage progressif, limitation de débit PostgreSQL, CSRF par en-tête, TOTP RFC 6238 maison (anti-rejeu, codes de secours), 2FA obligatoire OWNER/ADMIN, changement de mot de passe ; 175 tests | voir `git log` |
| 2026-11-02 | **P0-05** — API Fastify : `buildApp` injectable, config validée, erreurs uniformes (404/400/413/415/422/500 sans fuite), en-têtes de sécurité, CORS fermé, request-id, journal d'accès sans IP, `/health`, `/ready` (vraie base), OpenAPI 3.1 hors prod, serveur Node avec arrêt propre + entrée serverless ; ADR-0022 (pas de bundle) ; 143 tests | voir `git log` |
| 2026-11-02 | **P0-04** — `@dz/db` : Prisma 7.10 (adaptateur pg), schéma socle (11 modèles), migration init + contraintes SQL, compteur atomique (100 incréments concurrents ⇒ 1..100), bases de test clonées depuis un modèle migré, contrôle de dérive ; 115 tests | `0f8562b` |
| 2026-11-02 | **P0-03** — `@dz/core` : modules purs (`errors`, `money`, `time`, `ids`) et serveur (`env`, `logger` avec rédaction PII/secrets, `crypto` AES-256-GCM + rotation) ; frontières lint étendues ; 97 tests | `12afa1a` |
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
- **ADR-0023** : file de jobs maison sur PostgreSQL au lieu de pg-boss (à confirmer au checkpoint 0).

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
- Prisma : le dist-tag `latest` pointe vers une **8.0 rc** ; utiliser la **7.10.x stable**. Prisma 7 :
  générateur `prisma-client` (sortie obligatoire), URL dans `prisma.config.ts`, adaptateur
  `@prisma/adapter-pg` obligatoire, plus de moteur Rust (ARM64 sans souci), `.env` non chargé
  automatiquement, `migrate dev` ne lance plus `generate` ni le seed.
- Tests d'intégration DB : `createTestDatabase()` de `@dz/db/testing` (une base clonée par
  fichier de test) ; le package qui l'utilise doit déclarer le `globalSetup` de `@dz/db`
  (voir `packages/db/vitest.config.ts`). Bases `dz_test_tpl_*` / `dz_test_run_*` supprimées en fin
  de run ; après un crash, elles peuvent rester (sans risque, à supprimer à la main).
- API : `pnpm --filter @dz/api dev` (charge le `.env` racine, `node --watch`) ; production
  `node src/main-http.ts` (ADR-0022). Après `eslint --fix`, toujours reformater : `pnpm fix`.
- Auth : en-tête `x-dz-csrf: 1` obligatoire sur toute requête `/v1/*` mutante non-Bearer ;
  `.env` local doit contenir `APP_ENCRYPTION_KEYS` (commande dans `.env.example`).
- Jobs : `publishEvent(tx, event, clock.now())` dans la transaction métier ; `jobs.enqueue(tx, …)`
  pour un job direct ; handlers **idempotents** obligatoires (exécution au moins une fois).
- Toute nouvelle route `/v1` doit déclarer `config: { access: … }` ; une route publique doit
  aussi être ajoutée à la liste de `http/access.test.ts` (décision consciente).
- Premier OWNER : `pnpm --filter @dz/api create-owner --email … --name "…"` (mot de passe via
  `OWNER_PASSWORD` ou généré et affiché une fois).
- Premier enrôlement 2FA d'un OWNER/ADMIN : possible avec le seul mot de passe (pratique standard) ;
  ces comptes sont créés par le propriétaire (P0-07).
- Turbo 2 est en mode d'environnement strict : toute variable lue par une tâche doit être
  déclarée dans `turbo.json` (`env`), sinon elle n'arrive pas en CI.
- Logs : un nom écrit en texte libre dans un message n'est pas détectable — ne jamais mettre de
  donnée personnelle dans un message ; les passer en champs (masqués par clé).
- Production possiblement en **ARM64** (si Oracle) : vérifier dès P0-01 que Prisma, sharp et
  argon2 fournissent des binaires linux/arm64 ; images construites pour amd64 et arm64.
- Code portable test/production : adaptateur Astro, point d'entrée Fastify et mode des jobs
  (boucle/tick, ADR-0020) choisis par configuration — jamais de logique spécifique à Vercel.
