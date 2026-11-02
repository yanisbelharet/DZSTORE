# CLAUDE.md — DZ Commerce OS

Système e-commerce COD personnel (Algérie) : store multi-boutiques (ar RTL + fr), OMS séparé
(fr + en), transporteurs (EcoTrack), stock, agents et paie, pixels/CAPI, stats, landing builder,
IA. Qualité production exigée.

## Sources de vérité (lire avant d'agir)
- `PROGRESS.md` — état courant et file d'attente (lu à chaque début de session via `/reprendre`).
- `docs/PRD.md` — fonctionnel. `docs/ARCHITECTURE.md` — technique. `docs/ROADMAP.md` — phases.
- `docs/DECISIONS.md` — ADR : ne pas contredire sans proposer un nouvel ADR.
- `docs/integrations/ecotrack.md` + snapshot JSON — **seule** source pour l'API EcoTrack.
- `BUGS.md` — registre des bugs.

## Flux de travail
- Une tâche à la fois, via le skill `tache` (cadrage → plan → tests → code → `verify` → revue →
  commit → `PROGRESS.md`). Plan soumis au propriétaire si > 3 fichiers, schéma DB ou API publique.
- Bugs : skill `bug`. Fin de phase : `checkpoint`. Fin de session : `fin-session`. Reprise :
  `reprendre`.
- Bug découvert hors de la tâche en cours : le noter dans `BUGS.md`, ne pas le corriger en douce.
- Bug touchant argent, stock, envoi transporteur ou pixels = **S1** + vérifier les données affectées.

## Commandes (à la racine, Node 24 obligatoire)
`pnpm install` · `pnpm check` (format + lint + typecheck + tests + build : à lancer avant chaque
commit) · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm format` · `pnpm dev` ·
`pnpm db:local` (PostgreSQL local + bases `dz_dev`/`dz_test`).
À venir : `pnpm test:e2e`, `pnpm db:migrate`, `pnpm db:seed` (ajoutées ici quand elles existent).

## Conventions de code
- TypeScript strict, pas de `any` ni de `as` non justifié ; Zod à **chaque frontière** (HTTP,
  jobs, réponses externes, JSON en base).
- Identifiants et commentaires de code en anglais ; docs, UI par défaut et comptes rendus en
  français ; messages de commit en français au format Conventional Commits
  (`feat(orders): …`, `fix(shipping): …`).
- Argent : `Int` en dinars (DZD), jamais de flottant. Dates : UTC en base, `Africa/Algiers` à
  l'affichage.
- Prix, totaux, frais : **toujours recalculés côté serveur**.
- Logique métier pure dans `packages/domain` (sans I/O), testée en unitaire.
- Toute transition de statut de commande passe par le service unique de transition.
- Effets externes (transporteur, CAPI, IA) uniquement via outbox → jobs idempotents.
- CSS : propriétés logiques (`ms-*`, `pe-*`, `start`/`end`) pour le RTL ; aucun texte d'UI en dur
  (clés i18n).
- Logs : jamais de téléphone, nom, adresse, IP, jeton, clé ou query string de transporteur.

## Définition de « terminé »
Critères d'acceptation vérifiés avec preuve · lint, typecheck, tests verts · permissions
contrôlées côté API · entrées validées · erreurs gérées et lisibles · aucun secret ni donnée
personnelle dans les logs · `PROGRESS.md` à jour · commit fait et poussé.

## Interdits
- Inventer un endpoint, un champ ou un statut d'API externe.
- Désactiver, `skip` ou affaiblir un test pour le faire passer.
- Simplifier ou couper une fonctionnalité de la spec sans le dire.
- Installer une dépendance lourde sans justification (noter le pourquoi dans le plan).
- Générer de faux avis, témoignages, compteurs ou urgences présentés comme réels.
- Réinitialiser une base, supprimer des données ou pousser ailleurs que sur la branche de
  travail sans accord explicite.

## Git
- Branche de travail : `claude/vibrant-allen-p2e3je`. Push autorisé **après chaque commit** sur
  cette branche uniquement ; jamais `main`, jamais de force-push, jamais de PR sans demande.
- Secrets : `.env*` ignorés ; `.env.example` documente chaque variable sans valeur réelle.
