---
name: reprendre
description: Reprise de travail au début d'une nouvelle session DZ Commerce OS — relit CLAUDE.md, PROGRESS.md, BUGS.md et la tâche suivante, vérifie l'état du dépôt et des tests, puis propose la suite. À utiliser au début de chaque session, ou quand l'utilisateur tape /reprendre.
---

# /reprendre

1. `git fetch` + `git status` + `git log --oneline -10` : branche correcte, rien de non commité,
   pas de retard sur le remote.
2. Lire `CLAUDE.md`, `PROGRESS.md` (en entier), `BUGS.md` (bugs ouverts S1/S2).
3. Lire la tâche « En cours » ou la prochaine de la file dans `docs/ROADMAP.md`, et les sections
   du PRD/ARCHITECTURE qu'elle référence.
4. `pnpm install` si besoin, puis vérification rapide : `pnpm typecheck` et `pnpm test` (si le
   code existe). Signaler toute régression avant de continuer.
5. Résumé en 5 lignes max : où on en est, bugs ouverts prioritaires, prochaine tâche et son plan
   en une phrase, questions éventuelles.
6. Enchaîner avec `tache` sur la prochaine tâche, sauf instruction contraire.
