---
name: checkpoint
description: Clôture d'une phase de la roadmap DZ Commerce OS — vérification complète, revue par subagents, contrôle des critères de checkpoint, tag git cp-N. À utiliser quand toutes les tâches d'une phase sont terminées, ou quand l'utilisateur tape /checkpoint.
---

# /checkpoint

1. Vérifier que toutes les tâches de la phase sont « Terminé » dans `PROGRESS.md`.
2. Lancer `verify` complet (y compris e2e et Lighthouse si le store existe).
3. Contrôler un par un les **critères de checkpoint** de la phase (`docs/ROADMAP.md`) avec preuve.
4. **Revue par subagents** (en parallèle, sur le diff depuis le tag précédent) :
   - sécurité (RBAC, injections, secrets, PII, en-têtes, rate limit) ;
   - correction métier (machine à états, argent, stock, idempotence, concurrence) ;
   - performance et qualité (requêtes N+1, index manquants, bundle store, code mort).
   Trier les retours : corriger les vrais problèmes (via `bug` si c'en est un), noter le reste.
5. Mettre à jour la doc (ARCHITECTURE, DECISIONS, CLAUDE.md si de nouvelles commandes existent).
6. Si une base de prod existe : test de restauration de sauvegarde.
7. Tag annoté `cp-<N>` (« Checkpoint phase N : … »), push du tag (avec accord du propriétaire
   pour le tag).
8. Compte rendu : critères ✅/❌, findings, dettes acceptées, recommandations pour la phase suivante.
