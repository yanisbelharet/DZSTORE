# BUGS — registre

> Géré via le skill `bug`. Sévérités : **S1** argent, stock, envoi transporteur, pixels,
> sécurité/PII, perte de commande · **S2** fonctionnalité cassée sans contournement ·
> **S3** gêne avec contournement · **S4** cosmétique.

## Ouverts
### BUG-001 — `pnpm test` : échec intermittent de Vitest au démarrage (cache partagé)
- **Date** : 2026-11-02 · **Sévérité** : S3 · **Statut** : ouvert (surveillance)
- **Symptôme** : `Startup Error … ENOTEMPTY: directory not empty, rmdir
  'node_modules/.vitest-cache'` sur un package (vu sur `@dz/tooling`), le reste du run est annulé.
- **Contexte / reproduction** : premier `pnpm check` local après une modification de
  `pnpm-lock.yaml` (ajout des dépendances de l'admin) ; plusieurs processus Vitest lancés en
  parallèle par Turbo partagent `node_modules/.vitest-cache` à la racine. Non reproduit au
  lancement suivant (vert). Jamais vu en CI (checkout neuf, pas de cache existant).
- **Cause racine (probable)** : course entre processus Vitest 5.0.5 sur ce dossier commun (l'un
  le supprime pendant qu'un autre y écrit `CACHEDIR.TAG`) ; aucun test du projet en cause.
- **Contournement** : relancer `pnpm test`. Si cela se reproduit : donner à chaque package son
  propre dossier (`fsModuleCachePath`) ou signaler le problème en amont.
- **Correctif** : —
- **Test de régression** : —

## Résolus
_Aucun._

<!-- Modèle :
### BUG-001 — <titre court>
- **Date** : AAAA-MM-JJ · **Sévérité** : S? · **Statut** : ouvert | corrigé
- **Symptôme** :
- **Contexte / reproduction** :
- **Cause racine** :
- **Correctif** : <commit>
- **Test de régression** : <chemin du test>
- **Données affectées (S1)** : <requête, nombre, correction appliquée avec accord>
-->
