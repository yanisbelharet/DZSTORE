---
name: verify
description: Vérification complète avant de déclarer une tâche DZ Commerce OS terminée — lint, typecheck, tests unitaires/API/e2e, build, contrôle visuel UI (mobile/desktop, RTL), budgets de performance du store, recherche de fuites de secrets/PII. À utiliser à la fin de chaque tâche et lors des checkpoints.
---

# verify

Exécuter dans l'ordre ; s'arrêter et corriger au premier échec (ne jamais affaiblir un test).

1. `pnpm lint` puis `pnpm typecheck` (tout le monorepo, via Turborepo).
2. `pnpm test` (unitaires + intégration API sur vrai PostgreSQL). Noter le nombre de tests.
3. Si l'UI ou un flux bout en bout est touché : `pnpm test:e2e` (ou le sous-ensemble concerné).
4. `pnpm build` (tous les apps impactées).
5. **UI** : lancer l'app, captures Playwright mobile 390×844 et desktop 1440×900 ;
   store en `ar` (vérifier `dir="rtl"`, alignements, icônes directionnelles) et `fr` ;
   admin en `fr` et `en`. Regarder les captures, pas seulement les générer.
6. **Store** (si pages publiques touchées) : Lighthouse CI mobile — performance ≥ 90,
   LCP < 2,5 s, CLS < 0,1, JS initial < 50 Ko gzip sur produit/landing.
7. **Sécurité** :
   - `git diff --cached` / diff de la tâche : aucun secret, token, `.env`, donnée réelle.
   - Rechercher dans les logs de test des numéros `0[5-7]\d{8}` ou des jetons.
   - Nouvelles routes : permission déclarée + test de refus.
8. **Migrations** : `prisma migrate diff` cohérent, migration réversible ou plan de retour arrière
   noté.

Résumé à produire : commandes lancées, résultats (nombre de tests, durée), captures regardées,
écarts éventuels.
