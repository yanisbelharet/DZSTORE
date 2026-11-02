---
name: tache
description: Cycle obligatoire pour réaliser une tâche de la roadmap DZ Commerce OS (P0-01, P3-04…) — cadrage, plan, tests d'abord, implémentation, vérification, auto-revue, commit, PROGRESS.md. À utiliser pour toute tâche de développement, ou quand l'utilisateur tape /tache [ID].
---

# /tache [ID]

Sans ID : prendre la première tâche de la file d'attente de `PROGRESS.md`.

## 1. Cadrage
- Retrouver la tâche dans `docs/ROADMAP.md` et les sections liées du PRD / ARCHITECTURE / ADR.
- Lister les **critères d'acceptation** (ceux de la roadmap + ceux déduits de la spec).
- Vérifier les dépendances (tâches précédentes terminées ?). Sinon : le signaler et s'arrêter.

## 2. Plan
- Fichiers créés/modifiés, changements de schéma DB, endpoints (méthode, chemin, permission,
  schéma), composants UI, jobs, tests prévus, dépendances ajoutées (avec justification).
- **Soumettre le plan au propriétaire et attendre son OK** si : > 3 fichiers, schéma DB, ou API
  publique. Sinon, l'annoncer et continuer.

## 3. Tests d'abord
- Logique métier (domain, calculs, transitions, mapping) : écrire les tests **avant** le code,
  les voir échouer.
- API : tests d'intégration incluant au moins un cas refusé par permission et un cas d'entrée
  invalide.

## 4. Implémentation
- Petits incréments ; lancer les tests concernés souvent.
- Respecter `CLAUDE.md` (Zod aux frontières, argent en Int, i18n, propriétés CSS logiques,
  pas de PII dans les logs, effets externes via outbox).

## 5. Vérification
- Skill `verify`. Pour l'UI : lancer l'app et regarder (mobile 390×844 + desktop 1440×900,
  ar RTL + fr pour le store, fr + en pour l'admin) avec captures Playwright.

## 6. Auto-revue
Relire le diff comme un reviewer exigeant : cas limites, concurrence, idempotence, erreurs,
permissions, fuites de données, nommage, code mort, tests manquants. Corriger avant commit.

## 7. Commit + push
- `git add` ciblé, message Conventional Commits en français : `feat(scope): …`.
- `git push -u origin claude/vibrant-allen-p2e3je` (retries réseau 2/4/8/16 s).

## 8. PROGRESS.md
Déplacer la tâche dans « Terminé » (date, hash), mettre à jour « En cours », « Prochaine »,
hypothèses et points à valider. Commit `docs(progress): …` (peut être inclus dans le commit de la
tâche).

## Compte rendu (format imposé)
```
✅ <ID> — <titre>
Fait : <2–4 lignes>
Fichiers : <liste courte>
Tests : <ajoutés / résultat>
Commit : <hash> <message>
À valider par toi : <points précis, ou "rien">
Prochaine tâche : <ID> — <titre>
```
