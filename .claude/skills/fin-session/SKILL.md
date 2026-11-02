---
name: fin-session
description: Clôture propre d'une session de travail sur DZ Commerce OS avant que le contexte ne déborde — état sauvegardé dans PROGRESS.md, travail commité et poussé, consignes pour la reprise. À utiliser en fin de session ou quand le contexte devient long, ou quand l'utilisateur tape /fin-session.
---

# /fin-session

1. Si une tâche est en cours : l'amener à un état stable (tests verts) ou noter précisément où
   elle s'arrête (fichiers touchés, prochaine étape, commandes à relancer).
2. Mettre à jour `PROGRESS.md` :
   - « En cours » avec l'état exact ; « Prochaine action » en une phrase actionnable ;
   - décisions prises dans la session, hypothèses nouvelles, questions pour le propriétaire ;
   - tout piège découvert (commande qui échoue, contournement).
3. Si une règle a été répétée par le propriétaire : proposer de l'ajouter à `CLAUDE.md`.
4. `git status` propre : commit `chore(session): sauvegarde de fin de session` si nécessaire,
   push sur la branche de travail.
5. Résumé final : fait dans la session, état des tests, prochaine action, points à valider.
