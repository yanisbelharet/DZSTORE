# Décisions d'architecture (ADR)

> Format : Contexte → Décision → Conséquences → Alternatives écartées.
> Une décision acceptée n'est pas remise en cause sans **nouvel ADR** qui la remplace
> (statut de l'ancien passé à « Remplacée par ADR-XXXX »).
> Statuts : Proposée · Acceptée · Remplacée.

---

## ADR-0001 — Monorepo pnpm + Turborepo, TypeScript strict, Node 24 LTS
**Statut** : Acceptée (2026-11-01)
- **Contexte** : store, admin, API, worker et (plus tard) mobile partagent des types, schémas et
  règles métier ; développement assisté par IA sur plusieurs mois.
- **Décision** : monorepo `pnpm` workspaces + Turborepo (cache des tâches), TypeScript
  `strict` + `noUncheckedIndexedAccess`, ESLint (flat config) + Prettier, Node 24 LTS épinglé.
- **Conséquences** : un seul `pnpm lint|typecheck|test|build` ; frontières de packages explicites.
- **Écartées** : Nx (plus lourd), dépôts séparés (dérive des contrats).

## ADR-0002 — Store en Astro (SSR) + îlots Preact
**Statut** : Acceptée (2026-11-01)
- **Contexte** : exigence de JS minimal, LCP < 2,5 s en 4G, Lighthouse ≥ 90, pages produit et
  landing composées de blocs majoritairement statiques, multi-domaines.
- **Décision** : Astro en rendu serveur (adaptateur Node), composants `.astro` sans JS pour les
  blocs, îlots **Preact** (≈ 4 Ko) pour le formulaire COD, la galerie et l'upsell. HTML mis en
  cache au CDN **par hôte**, purge à la publication.
- **Conséquences** : composants interactifs du store en Preact (pas de React) ; le builder
  prévisualise via une route brouillon du store dans une iframe.
- **Écartées** : Next.js (runtime JS de base plus lourd, cache ISR multi-domaines plus complexe) ;
  SPA (SEO et LCP).

## ADR-0003 — Admin/OMS : SPA React + Vite + TanStack
**Statut** : Acceptée (2026-11-01)
- **Contexte** : interface dense, rapide, raccourcis clavier, tableaux virtualisés ; aucun besoin
  de SEO ; FR + EN.
- **Décision** : React 19 + Vite, TanStack Router (routes typées), TanStack Query (cache serveur),
  TanStack Table + Virtual, Tailwind CSS v4 + composants shadcn/ui (Radix), i18next (fr, en),
  palette de commandes.
- **Conséquences** : déployée en statique ; toutes les données via l'API.
- **Écartées** : Next.js (SSR inutile), Refine/React-Admin (moins de contrôle sur l'UX agent).

## ADR-0004 — API REST Fastify + Zod + OpenAPI ; worker dans la même application
**Statut** : Acceptée (2026-11-01)
- **Contexte** : clients multiples (admin, store, futur mobile Expo) ; besoin de contrats typés
  et documentés.
- **Décision** : Fastify 5 + `fastify-type-provider-zod`, REST JSON versionné `/v1`, OpenAPI
  générée depuis les schémas Zod du package `contracts`. `apps/api` a **deux points d'entrée** :
  `http` et `worker` (même code de services, déployés comme deux processus).
- **Conséquences** : aucune duplication de logique entre HTTP et jobs ; le store appelle l'API
  via son propre serveur (même origine pour le navigateur).
- **Écartées** : tRPC (moins adapté au mobile et aux clients tiers), NestJS (cérémonie),
  services séparés api/worker (duplication).

## ADR-0005 — PostgreSQL + Prisma ; UUIDv7 ; montants entiers DZD ; UTC
**Statut** : Acceptée (2026-11-01)
- **Décision** : PostgreSQL 17, Prisma ORM et migrations ; identifiants UUIDv7 (triés dans le
  temps) ; **montants en `Int` (dinars)** ; `timestamptz` en UTC, affichage `Africa/Algiers` ;
  numéro de commande lisible par boutique via compteur transactionnel. Les index partiels et
  contraintes non exprimables en Prisma sont ajoutés en SQL dans les migrations et documentés.
- **Écartées** : Drizzle (bon mais moins d'outillage migrations/seed), flottants pour l'argent.

## ADR-0006 — Jobs : pg-boss + outbox transactionnelle, sans Redis en v1
**Statut** : Acceptée (2026-11-01)
- **Contexte** : effets de bord externes (transporteur, CAPI, IA) qui doivent survivre aux pannes
  et ne jamais être perdus ni dupliqués ; hébergement managé où chaque service coûte.
- **Décision** : table `OutboxEvent` écrite **dans la même transaction** que le changement métier ;
  un relais (worker) la transfère vers **pg-boss** (file sur PostgreSQL) ; consommateurs
  **idempotents** (clés d'unicité métier) ; retries avec backoff exponentiel + jitter ;
  dead-letter consultable et rejouable depuis l'admin.
- **Conséquences** : une seule base à sauvegarder et surveiller ; débit largement suffisant pour
  le volume visé. Si besoin futur : file Redis derrière la même interface.
- **Écartées** : BullMQ + Redis (service de plus), envoi direct dans la requête HTTP (perte en
  cas de panne).

## ADR-0007 — Authentification par sessions opaques
**Statut** : Acceptée (2026-11-01)
- **Décision** : jeton aléatoire 256 bits, **haché** (SHA-256) en base ; cookie `HttpOnly`,
  `Secure`, `SameSite=Lax` pour l'admin, en-tête `Authorization: Bearer` pour le mobile ;
  Argon2id pour les mots de passe ; TOTP obligatoire pour OWNER/ADMIN ; expiration glissante
  + absolue ; révocation immédiate.
- **Écartées** : JWT (révocation difficile), fournisseurs externes (dépendance inutile pour un
  usage personnel).

## ADR-0008 — RBAC par matrice de permissions + périmètre de données
**Statut** : Acceptée (2026-11-01)
- **Décision** : permissions fines (`orders.read`, `orders.confirm`, `orders.forceStatus`,
  `stock.adjust`, `payouts.create`…) attribuées aux rôles dans le code (package `domain`) ;
  chaque route déclare sa permission ; un garde vérifie aussi le **périmètre** (boutiques
  accessibles, commandes de la file de l'agent) et masque les champs sensibles (coût, profit).
  Tests automatiques route × rôle.

## ADR-0009 — Chiffrement des secrets AES-256-GCM avec versions de clé
**Statut** : Acceptée (2026-11-01)
- **Décision** : table `Secret` (texte chiffré, IV, tag, version de clé, 4 derniers caractères
  pour l'affichage) ; clé maître 32 octets en variable d'environnement, plusieurs versions
  possibles pour la rotation ; déchiffrement uniquement dans le service qui en a besoin.

## ADR-0010 — Adaptateur transporteur ; EcoTrack d'après le snapshot officiel
**Statut** : Acceptée (2026-11-01)
- **Décision** : interface `CarrierAdapter` (créer, modifier, supprimer, valider, étiquette,
  suivre en lot, référentiels, tarifs, stock, remarques, retours) ; implémentation EcoTrack
  conforme à `docs/integrations/ecotrack.md` ; faux transporteur configurable pour les tests et
  le développement.

## ADR-0011 — Machine à états des commandes dans le domaine pur
**Statut** : Acceptée (2026-11-01)
- **Décision** : table des transitions (de, vers, acteurs autorisés, préconditions, effets)
  dans `packages/domain`, sans I/O, testée exhaustivement. **Un seul** service applicatif
  applique les transitions (HTTP, jobs, synchro transporteur) et écrit timeline + outbox dans la
  même transaction, avec verrou optimiste (`version`).

## ADR-0012 — Référentiel géographique canonique + correspondances par transporteur
**Statut** : Acceptée (2026-11-01)
- **Décision** : wilayas/communes canoniques (ar, fr, ASCII) versionnées dans `packages/geo` ;
  correspondances par compte transporteur générées par rapprochement (exact → normalisé →
  approché) et **validées manuellement** si incertaines ; jamais d'envoi d'un nom non mappé.

## ADR-0013 — Hébergement managé : Railway + Cloudflare
**Statut** : Proposée (2026-11-01) — à valider par le propriétaire
- **Contexte** : choix « services managés » ; processus permanents (worker) ; plusieurs
  domaines de boutique ; utilisateurs en Algérie (Europe proche).
- **Décision** : **Railway** (région Europe) pour `api-http`, `api-worker`, `store` et
  PostgreSQL (réseau privé, latence ~1 ms entre services) ; **Cloudflare** pour DNS, CDN/WAF de
  chaque domaine (cache HTML par hôte, règles de limitation), **R2** pour les médias et **Pages**
  pour l'admin statique. Sauvegardes : celles de Railway + `pg_dump` chiffré quotidien vers R2.
  Tout est conteneurisé (Dockerfile) pour rester portable.
- **Conséquences** : deux fournisseurs au lieu de quatre ; coût prévisible.
- **Écartées** : Vercel pour le store (cache multi-domaines plus délicat, worker hébergé ailleurs
  de toute façon) ; Neon (latence réseau inter-fournisseurs à chaque requête ; reste une option
  si la restauration à un instant donné devient prioritaire) ; Upstash (inutile sans Redis).

## ADR-0014 — Stratégie de tests
**Statut** : Acceptée (2026-11-01)
- **Décision** : Vitest pour l'unitaire et l'intégration API (Fastify `inject` + **vrai
  PostgreSQL**, base réinitialisée par fichier) ; HTTP externe simulé (fixtures issues des docs
  officielles) ; Playwright pour l'e2e (mobile + desktop, ar RTL + fr) ; Lighthouse CI avec budgets
  sur les pages du store. Voir ARCHITECTURE §7.

## ADR-0015 — Internationalisation
**Statut** : Acceptée (2026-11-01)
- **Décision** : store `ar` (défaut, RTL) + `fr`, dictionnaires typés, propriétés CSS logiques
  (`ms-`, `pe-`…) partout ; admin `fr` (défaut) + `en` via i18next, clés typées ; contenus
  métier localisés stockés en JSON `{ ar, fr }` validé par Zod.

## ADR-0016 — Observabilité et données personnelles
**Statut** : Acceptée (2026-11-01)
- **Décision** : logs JSON pino avec **rédaction** (téléphones, noms, adresses, IP, jetons,
  query strings des appels transporteur) ; identifiant de requête propagé aux jobs ; Sentry
  optionnel (sans données personnelles) ; endpoints `/health` et `/ready`.

## ADR-0017 — Médias : R2 + variantes générées
**Statut** : Acceptée (2026-11-01)
- **Décision** : téléversement direct vers R2 par URL présignée ; job de génération AVIF + WebP
  à largeurs fixes (sharp) ; `<picture>` avec `srcset`/`sizes` et dimensions explicites.

## ADR-0018 — Pixels : serveur comme source de vérité, déduplication par `event_id`
**Statut** : Acceptée (2026-11-01)
- **Décision** : `event_id` déterministe par commande et événement, partagé navigateur/serveur ;
  envoi serveur via outbox ; unicité pixel × événement × `event_id` ; déclencheur Purchase
  configurable par boutique. Les payloads suivent la doc officielle en vigueur (version vérifiée
  à l'implémentation).

## ADR-0019 — Ledgers immuables (stock, gains)
**Statut** : Acceptée (2026-11-01)
- **Décision** : les mouvements de stock et les gains agents ne sont **jamais modifiés ni
  supprimés** ; corrections par écritures inverses ; soldes dérivés (table `StockLevel` maintenue
  dans la même transaction + réconciliation périodique avec la somme du ledger).
