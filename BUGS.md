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
### BUG-003 — Anti-CSRF contourné par un chemin encodé (`/%761/…`)
- **Date** : 2026-11-09 · **Sévérité** : S1 (sécurité) · **Statut** : corrigé
- **Symptôme** : `POST /%761/users/<id>/reset-2fa` atteignait la route `/v1/…` (le routeur
  décode `%76`) sans l'en-tête `x-dz-csrf`, alors que `/v1/…` le refusait (403).
- **Cause racine** : le contrôle testait l'URL brute (`request.url.startsWith('/v1/')`).
- **Correctif** : décision sur la route atteinte (`routeOptions.url`) ; en-tête exigé sur toute
  requête non sûre sans Bearer, sauf `/v1/internal/*` (secret propre). Revue du checkpoint 0.
- **Test de régression** : `apps/api/src/modules/auth/auth.int.test.ts` (« chemin encodé »).
- **Données affectées (S1)** : aucune — pas d'environnement de production ni de test en ligne.

### BUG-004 — Déconnexion : le cookie de session restait dans le navigateur
- **Date** : 2026-11-09 · **Sévérité** : S3 · **Statut** : corrigé
- **Cause racine** : `clearCookie` sans `Secure` ; un cookie `__Host-` ainsi effacé est ignoré par
  les navigateurs (la session était bien révoquée côté serveur).
- **Correctif** : mêmes attributs qu'à la création. **Test** : `auth.int.test.ts` (« déconnexion »).

### BUG-005 — `TRUST_PROXY=true` : adresse IP du client falsifiable
- **Date** : 2026-11-09 · **Sévérité** : S2 (sécurité) · **Statut** : corrigé
- **Symptôme** : `X-Forwarded-For: 6.6.6.6, <ip réelle>` ⇒ `request.ip = 6.6.6.6` : limitation de
  débit par IP contournable, préfixe IP de l'audit falsifiable.
- **Correctif** : `TRUST_PROXY` = nombre de sauts ou liste d'adresses ; `true` refusé en
  production. **Test** : `apps/api/src/app.test.ts` (« derrière un proxy »).
- **Données affectées (S1)** : aucune (pas de production).

### BUG-006 — Logs : en-têtes et clés secrètes du projet non masqués
- **Date** : 2026-11-09 · **Sévérité** : S3 (latent, aucun chemin ne les journalisait) · **Statut** : corrigé
- **Cause racine** : masquage par nom exact (`x-dz-service-token`, `tickSecret`… absents) ;
  identifiants d'URL `postgresql://user:pass@` masqués par hasard.
- **Correctif** : masquage par fragment (`token`, `secret`, `password`, `cookie`…) et des
  identifiants d'URL. **Test** : `packages/core/src/logger.test.ts`.

### BUG-007 — Seed : base distante prise pour une base locale (`?host=`)
- **Date** : 2026-11-09 · **Sévérité** : S2 · **Statut** : corrigé
- **Symptôme** : `postgresql://u:p@localhost/db?host=prod` était jugée locale (réinitialisation et
  secrets de démo publics autorisés) alors que pg se connecte à `prod`.
- **Correctif** : `host`/`hostaddr` en paramètre ⇒ jamais locale ; mot de passe de démo public
  refusé hors local. **Test** : `apps/api/src/seed/seed.test.ts`.

### BUG-002 — Relance/abandon d'un job : heure système au lieu de l'horloge de l'application
- **Date** : 2026-11-06 · **Sévérité** : S4 · **Statut** : corrigé
- **Symptôme** : `POST /v1/jobs/:id/retry` fixait `runAt` (et `/cancel` `finishedAt`) avec
  `new Date()`, alors que toutes les heures de la file viennent de l'horloge de l'application
  (P0-08). Sans effet visible en production ; faux en test avec une horloge figée.
- **Cause racine** : les routes des jobs ne recevaient pas l'horloge.
- **Correctif** : horloge injectée dans `jobsRoutes` (P0-12).
- **Test de régression** : `apps/api/src/jobs/engine.int.test.ts` (« relance d'un job »).

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
