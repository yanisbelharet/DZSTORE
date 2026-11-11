# PROGRESS — DZ Commerce OS

> État vivant du projet. Lu au début de chaque session (`/reprendre`), mis à jour à la fin de
> chaque tâche (`/tache`) et de chaque session (`/fin-session`).

## État actuel
- **Phase** : 0 — Fondations (12/12 tâches ; P0-12 prêt, déploiement réel en attente des comptes).
- **Mode** : autonomie complète (propriétaire, 2026-11-09 : « continue, fais les choix toi-même,
  ne me demande aucune acceptation ») ; décisions consignées en ADR et dans les comptes rendus.
- **Session 1 (2026-11-01/02)** : cadrage terminé, kit reconstruit, architecture rédigée,
  **validés par le propriétaire le 2026-11-02**.
- **En cours** : —
- **Prochaine action** : Phase 1 — `/tache P1-02` (boutiques et domaines : administration). Déploiement réel de P0-12
  dès que le propriétaire fournit un jeton Vercel et une clé Neon (formulaire sécurisé depuis
  claude.ai sur ordinateur — l'app mobile ne l'affiche pas) ou suit `docs/deploiement-test.md`.

## File d'attente — Phase 0 (détails et critères : `docs/ROADMAP.md`)
1. ~~P0-01 — Monorepo et outillage qualité~~ ✅
2. ~~P0-02 — Environnement local et intégration continue~~ ✅
3. ~~P0-03 — Package `core` (env, logger avec rédaction, erreurs, ids, crypto, argent, temps)~~ ✅
4. ~~P0-04 — Package `db` : Prisma et schéma socle~~ ✅
5. ~~P0-05 — API HTTP : squelette Fastify~~ ✅
6. ~~P0-06 — Authentification (sessions, Argon2id, TOTP, limitation de débit)~~ ✅
7. ~~P0-07 — RBAC, périmètre boutique, audit, gestion des utilisateurs~~ ✅
8. ~~P0-08 — Worker : jobs, outbox, retries, dead-letter~~ ✅
9. ~~P0-09 — Admin : coquille (fr/en, connexion + 2FA, utilisateurs, palette)~~ ✅
10. ~~P0-10 — Store : coquille (résolution par hôte, ar RTL / fr, budgets Lighthouse)~~ ✅
11. ~~P0-11 — Seed déterministe et fabriques de test~~ ✅
12. ~~P0-12 — Déploiement de test sur Vercel + Neon~~ ✅ préparé et vérifié hors ligne ; mise en ligne en attente des comptes
13. ~~Checkpoint 0 (`/checkpoint`, tag `cp-0`)~~ ✅ (2026-11-11)

## Terminé
| Date | Élément | Commit |
|---|---|---|
| 2026-11-11 | **P1-01** — Référentiel géo `@dz/geo` : 69 wilayas / 1541 communes (loi n° 26-06, JORA n° 25 du 5 avril 2026, et loi 19-12) ; listes officielles extraites des PDF du JORA (effectifs vérifiés), noms arabes Wikidata (CC0), 47 rapprochements approchés et 16 corrections justifiées (`sources/overrides.json`), identifiants stables (numéro Wikidata) ; normalisation ar/latin + Jaro-Winkler ; tables `Wilaya`/`Commune`, `pnpm db:geo` (idempotent, non destructif), `GET /v1/geo/…` en cache ; `SOURCE.md` | voir `git log` |
| 2026-11-09 | **P0-12** — Environnement de test prêt : API assemblée en un fichier par Vite pour Vercel (migrations directes + seed à la demande + bundle ; vérifié avec `vercel build` hors ligne : fonction `nodejs24.x`, Argon2 embarqué, et bundle servi réellement contre PostgreSQL), `vercel.json` des 3 projets, domaines `*.vercel.app` par boutique (seed `SEED_STORE_HOSTS`), marqueur `DEPLOYMENT_ENVIRONMENT=test` (mention + `noindex` store/admin), page admin « Système » (tour de traitement + événement de test traité via l'outbox, e2e), guide `docs/deploiement-test.md`, ADR-0025, BUG-002 corrigé | voir `git log` |
| 2026-11-03 | **P0-11** — `pnpm db:seed` : 2 boutiques (`beaute.localhost`, `maison.localhost`) et 6 comptes (un par rôle + agent mixte), idempotent (2e exécution : rien ne change, pas même `updatedAt` — prouvé par mutation), répare les données de démo sans toucher au reste ; refus en production ; `--reset` réservé aux bases locales ; mot de passe et 2FA de démo publics **uniquement** en local, `SEED_DEMO_PASSWORD` exigé ailleurs ; connexion OWNER + TOTP de démo testée ; fabriques `createFactories` (`@dz/db/testing`) ; README « Données de démo » | voir `git log` |
| 2026-11-03 | **P0-10** — Store Astro 7 SSR (adaptateur Node ou Vercel choisi au build) + Preact : boutique résolue par l'en-tête `Host` via `GET /v1/public/stores/resolve` (nouvel accès `service`, jeton de service), cache mémoire (TTL, coalescence, périmé si API en panne, borné) ; langue par préfixe (défaut de la boutique sans préfixe, 301 sinon), `dir="rtl"` en arabe ; thème en variables CSS ; police Cairo auto-hébergée ; CSP par hachages + `frame-ancestors`, en-têtes de sécurité et de cache CDN ; 404 boutique, 404/503 bilingues, `/health` ; ADR-0024 ; e2e mobile/desktop (2 hôtes, ar/fr, 404, 503) + budgets Lighthouse (perf 0,99–1, a11y/SEO 1, 0 Ko de JS) | voir `git log` |
| 2026-11-02 | **P0-09** — Admin React 19 + Vite 8 + TanStack Router/Query, Tailwind 4 : connexion, enrôlement et vérification 2FA (QR, codes de secours), coquille (navigation selon les permissions, sélecteur de boutique, fr/en, tiroir mobile), palette `Ctrl+K` et raccourcis, gestion des utilisateurs (liste filtrable, création, édition, actions critiques confirmées) ; `/v1/auth/me` renvoie permissions et boutiques ; pages chargées à la demande ; e2e Playwright (3 parcours réels, captures mobile/desktop) + job CI e2e ; 223 tests | voir `git log` |
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
- Déploiement de test : fournir un jeton Vercel et une clé Neon (claude.ai sur ordinateur) ou
  suivre `docs/deploiement-test.md`.

## Checkpoint 0 (2026-11-11, tag `cp-0`)
- ✅ install/lint/typecheck/tests (365) /build verts ; CI verte (runs 13–14 lus ; GitHub MCP
  ensuite indisponible) ; e2e admin 3/3, store 26/26 dont budgets Lighthouse.
- ✅ `pnpm dev` lance API, worker, admin et store ; connexion OWNER + 2FA dans l'admin seedé.
- ✅ Matrice RBAC testée ; outbox → job → retries → DLQ → relance testés.
- ✅ Deux boutiques par hôte, ar RTL et fr ; Lighthouse mobile 0,99–1.
- ❌ Environnement Vercel + Neon **en ligne** : prêt et vérifié hors ligne, en attente des comptes.
- ✅ Aucun secret dans le dépôt ; logs d'une session complète sans donnée personnelle.
- ✅ PROGRESS, CLAUDE.md, ARCHITECTURE, DECISIONS (ADR-0024/0025, ADR-0020 aligné, ADR-0023 confirmé).
- Revue par 3 subagents : 10 correctifs (BUG-003 à BUG-010 + durcissements).
- **Dettes acceptées** : 3 requêtes SQL par requête authentifiée (jointure à faire) ; DTO de
  l'admin non validés par Zod (déplacer dans `@dz/contracts`) ; palette de commandes à charger à
  la demande ; codes de secours en SHA-256 sans clé serveur (HMAC) ; journal d'audit append-only
  par convention (trigger à ajouter) ; limite de débit par compte = vecteur de déni de service
  (accepté : 2FA, pas de verrouillage dur des comptes 2FA) ; e2e admin sur serveur de dev (pas
  sur le build) ; `originList` dupliqué API/store ; constantes `*Package` du squelette.
- **Phase 1** : le référentiel géo suit le découpage en vigueur (69 wilayas, 1541 communes, loi
  n° 26-06 du 4 avril 2026, JORA n° 25) au lieu des 58 du PRD ; noms ar/fr depuis Wikidata (CC0).

## Pièges et notes techniques
- Le serveur MCP GitHub ne s'est pas connecté dans la session 1 ; `git push` fonctionne.
- Conteneur cloud éphémère : tout doit être commité **et poussé** avant la fin d'une session.
- Node 22 par défaut dans le conteneur : Node 24.22.2 installé via nvm ; **préfixer chaque
  commande** par `export PATH=/root/.nvm/versions/node/v24.22.2/bin:$PATH` (pnpm 10.28 y est
  installé). Avec Node 22, `pnpm install` est refusé (engine-strict) — c'est voulu.
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
- Admin : `pnpm --filter @dz/admin dev` (Vite, proxy `/api` → `ADMIN_API_TARGET`, défaut
  `http://localhost:3000`) ; garde d'accès UI = confort, l'API reste l'autorité. Textes UI
  uniquement via les clés typées `src/i18n/{fr,en}.json` (une clé absente casse le typecheck).
- E2E : `pnpm test:e2e` recrée la base `dz_e2e` (garde-fou : nom contenant `test`/`e2e`), crée
  l'OWNER par la CLI de production, lance API (port 3101) + admin (5174). Chromium préinstallé
  (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) ⇒ `@playwright/test` **épinglé à 1.63.0** ;
  captures dans `apps/admin/test-results/screenshots/` (non versionnées, artefact CI).
- Vitest : échec intermittent possible au premier run après un changement de lockfile (BUG-001) ;
  relancer.
- Store : `pnpm --filter @dz/store dev` charge le `.env` racine (variables `STORE_*` +
  `STORE_SERVICE_TOKEN` identique côté API) ; boutiques locales sur `http://<hôte>.localhost:4321`
  (Chromium résout `*.localhost`), hôtes enregistrés dans `StoreDomain` (seed : P0-11). La CSP
  n'est pas appliquée par `astro dev` : la vérifier sur un build (`astro build` + `pnpm start`).
- Store : la boutique vient de l'en-tête `Host` brut, jamais de `X-Forwarded-Host` ni de
  `Astro.url` (qui vaut `localhost`, ADR-0024). Conséquence à traiter avec le formulaire de
  commande (P2) : le contrôle d'origine d'Astro (`checkOrigin`) compare à `Astro.url` ⇒ s'appuyer
  sur `Sec-Fetch-Site` / un contrôle maison, à tester en e2e.
- Store : favicon neutre commune (`public/favicon.svg`) ; favicon/logo par boutique avec les
  réglages de boutique. Sélection d'une boutique de démo sur `*.vercel.app` : P0-12.
- Lighthouse : exécuté dans Playwright (projet `lighthouse`, Chromium `channel: 'chromium'`) ;
  rapports HTML/JSON dans `apps/store/test-results/lighthouse/` (artefact CI).
- Seed : `pnpm db:seed` (idempotent). **Ne jamais lancer `--reset` sur `dz_dev` sans accord du
  propriétaire** (le garde-fou de session le bloque) : la réinitialisation est couverte par le
  test d'intégration sur une base de test isolée. Données générées (commandes, etc.) : à ajouter
  phase par phase avec un générateur pseudo-aléatoire à graine fixe.
- Arrêter un serveur lancé en arrière-plan par son PID exact : `pkill -f`/`pgrep -f` sur un
  motif présent dans la ligne de commande tue aussi le shell de l'outil.
- Vercel (ADR-0025) : `pnpm --filter @dz/api vercel-build` reproduit le build de l'API (migrations,
  seed si `SEED_ON_DEPLOY=true`, bundle `.vercel-build/server.mjs`). Vérification fidèle sans
  compte : `vercel build` (CLI installé hors dépôt) avec un `.vercel/project.json` factice à la
  racine (`rootDirectory: apps/api`) — supprimer `.vercel/` ensuite.
- Node 24 est aussi fourni par l'image (`/opt/node24/bin`, 24.22.1) ; pnpm 10.28 est dans le PATH.
- Les jetons (Vercel, Neon) ne peuvent pas être demandés depuis l'app mobile Claude : le
  propriétaire doit ouvrir la session sur claude.ai depuis un ordinateur.
