# PROGRESS — DZ Commerce OS

> État vivant du projet. Lu au début de chaque session (`/reprendre`), mis à jour à la fin de
> chaque tâche (`/tache`) et de chaque session (`/fin-session`).

## État actuel
- **Phase** : 0 — Fondations (non démarrée).
- **Session 1 (2026-11-01/02)** : cadrage terminé, kit reconstruit, architecture rédigée.
  **En attente de la validation explicite du propriétaire (étape D)** avant tout code.
- **En cours** : —
- **Prochaine action** : après validation, `/tache P0-01`.

## File d'attente — Phase 0 (détails et critères : `docs/ROADMAP.md`)
1. P0-01 — Monorepo et outillage qualité
2. P0-02 — Environnement local et intégration continue
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
| 2026-11-02 | Session 1 — kit reconstruit (CLAUDE.md, PRD, ROADMAP, DECISIONS, 11 skills, doc EcoTrack + snapshot officiel), ARCHITECTURE.md (schéma Prisma validé, diagrammes Mermaid vérifiés) | voir `git log` |

## Décisions de la session 1 (détail : PRD §26, DECISIONS.md)
- Plusieurs boutiques (`storeId` partout) · hébergement : test gratuit sur Vercel + Neon, production
  sur VPS avant toute vente · admin fr + en · paie fixe par commande livrée · pas de reprise de
  données · push après chaque commit sur la branche de travail.
- Doc EcoTrack officielle (Postman) figée en snapshot daté ; 🔶 à vérifier sur le compte réel.

## À valider par le propriétaire
1. ~~ADR-0013 (hébergement)~~ — **tranché le 2026-11-02** : test gratuit et non commercial sur
   Vercel Hobby + Neon Free (P0-12) ; production sur un VPS choisi avant toute vente réelle (P6).
   Actions propriétaire : créer les comptes Vercel et Neon avant P0-12.
2. **ADR-0002 (store en Astro)** et **ADR-0006 (files sur PostgreSQL, sans Redis)**.
3. **Ordre de la roadmap** : mise en production après P6 ; stock, paie, statistiques complètes,
   builder et IA ensuite (paie et statistiques calculées rétroactivement depuis l'historique).
4. Hypothèses [H] du PRD §26 (seuils anti-fraude, verrou 10 min, déclencheur Purchase par défaut
   `ON_CONFIRMED`, validation transporteur manuelle par lot…).
5. Mode de travail : validation du plan à chaque tâche (règle actuelle) ou enchaînement autonome
   de la Phase 0 avec arrêt uniquement sur blocage.

## Pièges et notes techniques
- Le serveur MCP GitHub ne s'est pas connecté dans la session 1 ; `git push` fonctionne.
- Conteneur cloud éphémère : tout doit être commité **et poussé** avant la fin d'une session.
- Node 22 dans le conteneur de la session 1 (cible : Node 24 LTS, à installer en P0-01).
- Docker non vérifié dans le conteneur : prévoir PostgreSQL natif en repli (P0-02).
- Production possiblement en **ARM64** (si Oracle) : vérifier dès P0-01 que Prisma, sharp et
  argon2 fournissent des binaires linux/arm64 ; images construites pour amd64 et arm64.
- Code portable test/production : adaptateur Astro, point d'entrée Fastify et mode des jobs
  (boucle/tick, ADR-0020) choisis par configuration — jamais de logique spécifique à Vercel.
