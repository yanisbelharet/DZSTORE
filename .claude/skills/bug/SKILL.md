---
name: bug
description: Traitement d'un bug dans DZ Commerce OS — consignation dans BUGS.md, test qui reproduit, cause racine, correctif minimal, test de régression, vérification des données affectées pour les S1. À utiliser dès qu'un bug est signalé ou découvert, ou quand l'utilisateur tape /bug.
---

# /bug [description]

1. **Consigner** dans `BUGS.md` : ID `BUG-NNN`, date, sévérité, symptôme, contexte, statut
   `ouvert`.
   - **S1** : argent (montants, gains, profit), stock, envoi transporteur (doublon, mauvaise
     commune, mauvais montant COD), pixels (double Purchase, données non hachées), sécurité/PII,
     perte de commande.
   - **S2** : fonctionnalité cassée sans contournement. **S3** : gêne, contournement possible.
     **S4** : cosmétique.
2. Si le bug est hors de la tâche en cours et non S1 : le consigner seulement, prévenir, revenir à
   la tâche.
3. **Reproduire** par un test automatisé qui échoue (unitaire si possible, sinon API/e2e).
4. **Cause racine** : expliquer *pourquoi* (pas seulement *où*). Chercher les autres occurrences
   du même motif.
5. **Correctif minimal**, sans refactor opportuniste.
6. Le test passe ; suite complète via `verify`.
7. **S1 : données déjà affectées** — requête d'identification (lecture seule), nombre de lignes,
   proposition de correction (script idempotent, en transaction, avec audit) **soumise au
   propriétaire avant exécution**.
8. Mettre à jour `BUGS.md` (cause, correctif, commit, test de régression, données corrigées),
   commit `fix(scope): … (BUG-NNN)`, push.
