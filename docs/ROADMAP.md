# ROADMAP — DZ Commerce OS

> Chaque tâche a un ID `P<phase>-<nn>`, se réalise avec le skill `tache`, et n'est terminée que
> selon la définition de `CLAUDE.md`. Chaque phase se clôt par `/checkpoint` (tag `cp-<N>`).
> Les critères d'acceptation des phases ≥ 1 sont détaillés au moment de leur planification
> (début de phase), à partir du PRD.

## Pourquoi ce découpage

1. **Vendre au plus tôt** : après P6, la chaîne complète est en production (store → commande →
   anti-fraude → confirmation → expédition EcoTrack → suivi → pixels). Stock, paie, statistiques
   avancées, builder et IA enrichissent ensuite un système qui tourne déjà.
2. **Collecter les données dès le début** : événements funnel, attribution, auteur de chaque
   confirmation et historique des statuts sont enregistrés dès P2/P3. La paie (P8) et les
   statistiques (P9) pourront donc être **calculées rétroactivement**, sans perte.
3. **Traiter les risques techniques tôt** : outbox, idempotence, jobs, RBAC et chiffrement en P0 ;
   intégration EcoTrack (doublons, limite de taux, mapping géo) avant la mise en production.
4. **Pixels après le transporteur** : un déclencheur `Purchase` à l'expédition ou à la livraison
   dépend du suivi des colis.
5. **Blocs dès P2, éditeur en P10** : la page produit est déjà rendue par blocs (gabarit fixe),
   donc l'éditeur n'impose aucune réécriture du store.

## Vue d'ensemble

| Phase | Objet | Livrable visible |
|---|---|---|
| P0 | Fondations | Monorepo, CI, API, auth/RBAC, jobs/outbox, coquilles admin et store |
| P1 | Référentiels & catalogue | Géo DZ, tarifs, médias, produits, variantes, offres, boutiques |
| P2 | Store COD | Page produit rapide, formulaire COD, commande idempotente, anti-fraude |
| P3 | OMS & confirmation | Liste, fiche, timeline, file de confirmation, raccourcis |
| P4 | Transporteur EcoTrack | Envois sans doublon, étiquettes, suivi auto, file de suivi, retours |
| P5 | Pixels & CAPI | Meta/TikTok navigateur + serveur, déclencheur Purchase réglable |
| P6 | Mise en production MVP | Déploiement, sauvegardes, observabilité, revue sécurité, charge |
| P7 | Stock | Ledger, réservations, transferts, rapprochement transporteur |
| P8 | Agents & paie | Barèmes, gains, contre-passations, paiements, dashboards agents |
| P9 | Statistiques | Funnel, taux, profit net, dépenses pub, ventilations |
| P10 | Landing builder | Blocs, éditeur, aperçu, publication, thème |
| P11 | IA | Clés, génération de textes/landings/thèmes, coûts |
| P12 | Mobile | Application Expo sur la même API |

---

## Phase 0 — Fondations

### P0-01 — Monorepo et outillage qualité
- pnpm workspaces + Turborepo ; arborescence `apps/{api,admin,store}`,
  `packages/{core,db,domain,contracts,config}` (les autres packages arrivent avec leur phase).
- TypeScript strict partagé, ESLint flat config + Prettier, Vitest, `.editorconfig`,
  `.nvmrc`/`engines` (Node 24), `.env.example`, `.gitignore`.
- Scripts racine : `dev`, `lint`, `typecheck`, `test`, `build`, `format`.
- **Acceptation** : `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  verts sur un dépôt neuf ; un test d'exemple par package ; règles d'import entre packages
  (pas d'import `apps → apps`, `domain` sans dépendance I/O) vérifiées par lint.

### P0-02 — Environnement local et intégration continue
- PostgreSQL local (Docker Compose, ou service natif si Docker indisponible) ; script de
  démarrage documenté.
- GitHub Actions : install (cache pnpm), lint, typecheck, tests unitaires, tests API avec service
  PostgreSQL, build ; e2e Playwright quand ils existent.
- **Acceptation** : pipeline vert sur la branche ; échec visible si un test casse ; temps < 10 min.

### P0-03 — Package `core`
- Configuration d'environnement validée par Zod (échec explicite au démarrage).
- Logger pino avec **rédaction** (téléphones, noms, adresses, IP, jetons, query strings) +
  identifiant de corrélation.
- Erreurs applicatives typées (code stable, statut HTTP, message i18n), UUIDv7, helpers argent
  (DZD entiers) et temps (UTC ↔ Africa/Algiers).
- Chiffrement AES-256-GCM avec versions de clé (ADR-0009).
- **Acceptation** : tests unitaires (rédaction effective sur des payloads réalistes, aller-retour
  chiffrement, rotation de clé, rejet d'un texte chiffré altéré, config invalide).

### P0-04 — Package `db` : Prisma et schéma socle
- Prisma + PostgreSQL 17 ; modèles socle : `Store`, `StoreDomain`, `StoreCounter`, `User`,
  `UserStoreAccess`, `Session`, `AuditLog`, `Secret`, `OutboxEvent`, `IdempotencyKey`,
  `AppSetting` (conformes à ARCHITECTURE §3).
- Client singleton, helpers de transaction, utilitaire de base de test (création/réinitialisation
  isolée par fichier de test), compteur transactionnel de numéros.
- **Acceptation** : `pnpm db:migrate` sur base vide ; tests d'intégration des contraintes
  d'unicité et du compteur (100 incréments concurrents ⇒ 100 numéros distincts et contigus).

### P0-05 — API HTTP : squelette
- Fastify 5 + type provider Zod ; préfixe `/v1` ; format d'erreur uniforme ; OpenAPI générée
  (UI de doc hors production) ; en-têtes de sécurité ; CORS fermé par défaut (admin sur la même
  origine, ADR-0021) ; limite de taille de requête ; `/health` et `/ready` (DB) ; arrêt gracieux.
- Deux points d'entrée : serveur Node (production) et fonction serverless (test Vercel), même
  application.
- **Acceptation** : tests `inject` (404 et 422 au bon format, en-têtes présents, CORS refusé pour
  une origine inconnue, `/ready` en échec si DB coupée) ; OpenAPI valide ; l'application démarre
  dans les deux modes (serveur et handler serverless).

### P0-06 — Authentification
- Connexion e-mail + mot de passe (Argon2id), sessions opaques hachées (cookie admin, Bearer
  mobile), expiration glissante + absolue, déconnexion, révocation de toutes les sessions.
- TOTP obligatoire pour OWNER/ADMIN (enrôlement, vérification, codes de secours).
- Limitation de débit et verrouillage progressif sur la connexion ; messages d'erreur non
  énumérants ; protection CSRF.
- **Acceptation** : tests API (mauvais mot de passe, verrouillage, 2FA requise et vérifiée,
  session expirée/révoquée, cookie `HttpOnly`/`Secure`/`SameSite`), aucun mot de passe ni jeton
  dans les logs.

### P0-07 — RBAC, périmètre boutique, audit, utilisateurs
- Matrice permissions × rôles (`packages/domain`), garde déclaratif par route, périmètre par
  boutique, masquage des champs sensibles.
- Service d'audit (acteur, action, entité, avant/après, IP) ; endpoints de gestion des
  utilisateurs (création d'agents, rôles, boutiques, désactivation) réservés OWNER/ADMIN.
- **Acceptation** : test automatique « chaque route × chaque rôle » (autorisé/refusé attendu) ;
  un agent ne voit jamais une boutique non attribuée ; actions sensibles présentes dans l'audit.

### P0-08 — Worker : jobs, outbox, retries, dead-letter
- Moteur `runTick()` (ADR-0020) utilisé par le point d'entrée `worker` (boucle) et par
  `/v1/internal/tick` (serverless, secret) ; file de jobs PostgreSQL (ADR-0023) ; registre typé des jobs
  (payload Zod) ; relais outbox → files ; politique de retries (backoff exponentiel + jitter, erreurs non rejouables) ;
  dead-letter ; endpoints admin « jobs en échec » (liste, détail, relance) ; tâche planifiée
  d'exemple.
- **Acceptation** : tests d'intégration — événement écrit dans une transaction annulée ⇒ aucun
  job ; transaction validée ⇒ job exécuté une fois ; handler en échec ⇒ retries puis DLQ ;
  relance depuis la DLQ ; crash simulé du relais ⇒ pas de perte (au moins une fois) et handler
  idempotent ⇒ effet unique ; ticks simultanés ⇒ jobs disjoints (aucun traité deux fois) ;
  résultats identiques en mode boucle et en mode tick.

### P0-09 — Admin : coquille
- Vite + React + TanStack Router/Query, Tailwind v4 + shadcn/ui, i18n **fr/en** (clés typées),
  connexion + 2FA, mise en page (barre latérale, sélecteur de boutique, menu utilisateur),
  écrans de gestion des utilisateurs, palette de commandes et infrastructure de raccourcis,
  gestion d'erreurs (toasts, page d'erreur), confirmations d'actions critiques.
- **Acceptation** : e2e Playwright (connexion + 2FA, création d'un agent, changement de langue,
  refus d'accès d'un agent à la gestion des utilisateurs) ; captures mobile/desktop vérifiées.

### P0-10 — Store : coquille
- Astro SSR (adaptateur Node en production, Vercel en test, choisi par configuration) + Preact ; résolution de la boutique par **nom d'hôte** (cache
  court) ; routage `ar` (défaut, RTL) / `fr` ; mise en page et tokens de thème depuis la
  boutique ; polices auto-hébergées ; en-têtes de sécurité/CSP ; en-têtes de cache CDN par hôte ;
  pages 404 et santé.
- Lighthouse CI configuré avec budgets (≥ 90 perf mobile, JS < 50 Ko) sur la page d'accueil.
- **Acceptation** : deux hôtes locaux affichent deux boutiques distinctes ; hôte inconnu ⇒ 404 ;
  `dir="rtl"` en arabe ; e2e mobile/desktop ar/fr ; budget Lighthouse respecté en CI.

### P0-11 — Seed déterministe et fabriques de test
- Seed reproductible (graine fixe) : 2 boutiques et leurs domaines locaux, un utilisateur par rôle
  (OWNER, ADMIN, agent confirmation, agent suivi, agent mixte), données de démonstration
  **fictives** ; commande `pnpm db:seed` ; réinitialisation réservée à l'environnement local
  (garde-fou explicite).
- Fabriques de test réutilisables (`packages/db/testing`).
- **Acceptation** : seed idempotent (deux exécutions ⇒ même état) ; refus d'exécution si
  `NODE_ENV=production` ; identifiants de démo documentés dans le README.

### P0-12 — Déploiement de test sur Vercel + Neon (gratuit, non commercial)
- Trois projets Vercel (store, admin, api) déployés à chaque push de la branche de travail ;
  base Neon Free ; migrations appliquées au déploiement ; seed de démonstration à la demande ;
  réécriture `/api` de l'admin vers l'API (ADR-0021) ; tick déclenchable depuis l'admin et par
  un cron externe gratuit (≥ 30 min).
- Guide pas à pas pour le propriétaire (création des comptes Vercel et Neon, import du dépôt,
  variables d'environnement) ; aucun secret dans le dépôt.
- **Prérequis propriétaire** : comptes Vercel (Hobby) et Neon (Free) créés et reliés au dépôt
  GitHub.
- **Acceptation** : URL de test accessible sur mobile ; connexion à l'admin seedé ; deux
  boutiques de démo affichées ; un événement outbox traité par un tick ; mention « environnement
  de test » visible dans l'admin et le store.

### Checkpoint 0 (`cp-0`)
- `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` verts ; CI verte.
- `pnpm dev` lance API, worker, admin et store ; connexion OWNER avec 2FA depuis l'admin seedé.
- Matrice RBAC testée ; démonstration outbox → job → retries → DLQ → relance.
- Deux boutiques servies par hôte, en ar RTL et fr ; budget Lighthouse respecté.
- Environnement de test Vercel + Neon fonctionnel (URL partagée au propriétaire).
- Aucun secret dans le dépôt ; logs vérifiés sans données personnelles.
- `PROGRESS.md`, `CLAUDE.md` (commandes réelles) et `ARCHITECTURE.md` à jour.

---

## Phase 1 — Catalogue et store COD (phases 1 et 2 fusionnées, propriétaire 2026-11-12)
Ordre fixé par le propriétaire (a → i). Les anciens identifiants P2-xx sont rappelés entre
parenthèses ; les tâches ★ n'existaient pas dans la roadmap initiale.
- **P1-01** Référentiel géo (+ P1-01b : codes 59–69 du décret 26-206, anciens noms, wilaya
  d'origine) ✅
- **P1-02** Boutiques, version minimale : paramètres (nom, langues, préfixe de numéro, thème de
  base), domaines en lecture seule (branchement des domaines personnalisés en phase 10).
- **a — P1-03** Médias : interface `MediaStorage` (disque local, R2), variantes AVIF/WebP.
- **a — P1-04** Produits et variantes : CRUD, SKU, coûts, statuts, SEO, duplication.
- **b — P1-05** Offres par quantité, upsell et cross-sell (modèle + admin) ; la duplication d'un
  produit copie aussi ses offres.
- **b — P1-06 ★** Codes promo (montant/pourcentage, plafond, période, usage ; recalcul serveur).
- **c — P1-07** Frais de livraison par boutique × wilaya × type × transporteur ; wilayas 59–69 :
  frais par défaut de la wilaya mère (`legacyWilayaCode`), le transporteur facturant sur 58.
- **P1-08** Dette : validation Zod des réponses de l'API dans l'admin (schémas partagés).
- **d — P1-09** Package `blocks` v1 + page produit (ex-P2-01, P2-02) : Lighthouse mobile ≥ 90 ;
  produits de démo dans le seed.
- **e — P1-10** Formulaire COD (ex-P2-03) : recherche de commune par nom qui propose la bonne
  wilaya (anciens noms, ancienne wilaya : « Aflou » choisi sous « Laghouat »).
- **e — P1-11** Création de commande idempotente (ex-P2-04) + capture UTM/fbclid/ttclid et
  événements funnel (ex-P2-07).
- **f — P1-12** Anti-fraude v1 (ex-P2-05, skill `cod-antifraude`).
- **g — P1-13 ★** Formulaires abandonnés (saisie partielle consentie, relance par l'OMS).
- **h — P1-14** Page merci + upsell 1 clic (ex-P2-06) ; **★** page de suivi client.
- **i — P1-15 ★** Personnalisation de base et pages légales (mentions, CGV, confidentialité) ;
  catégories de produits (PRD §5, « catégorie optionnelle », reportée de P1-04 : utile à la page
  d'accueil).
- **P1-16** Budgets de performance et e2e du parcours complet (ex-P2-08).
- **Checkpoint 1** : commande passée depuis un vrai téléphone en 4G sur l'environnement de test ;
  double soumission ⇒ une commande ; une commande d'une nouvelle wilaya et une commune saisie
  sous son ancien nom fonctionnent ; règles anti-fraude couvertes par des tests ; Lighthouse
  mobile ≥ 90 sur la page produit.

## Phase 3 — OMS et confirmation
- **P3-01** Machine à états + service de transition + timeline (`OrderEvent`).
- **P3-02** Liste virtualisée, filtres, recherche, vues enregistrées, export CSV sûr.
- **P3-03** Fiche commande (détail, timeline, remarques, édition avec recalcul, historique client).
- **P3-04** File de confirmation (verrou, « suivante », résultats d'appel, rappels,
  annulation automatique proposée).
- **P3-05** Écran agent : raccourcis clavier, palette, liens `tel:`/WhatsApp.
- **P3-06** Doublons, liste noire, commandes bloquées (écrans et actions).
- **P3-07** Actions groupées + tableau de bord minimal (compteurs par statut et par agent).
- **Checkpoint 3** : un agent confirme une commande en < 10 s au clavier ; deux agents ne peuvent
  pas traiter la même commande ; transitions interdites refusées par l'API ; timeline complète.

## Phase 4 — Transporteur EcoTrack
- **P4-01** Interface `CarrierAdapter`, erreurs typées, faux transporteur.
- **P4-02** Adaptateur EcoTrack (skill `ecotrack`) : client HTTP limité, sérialiseurs, mapping.
- **P4-03** Comptes transporteur (secret chiffré, test de connexion) + synchro wilayas,
  communes, bureaux, tarifs.
- **P4-04** Correspondances géographiques : rapprochement automatique + écran de revue.
- **P4-05** Création d'envoi idempotente + réconciliation (jamais de doublon), y compris le mode
  « stock chez le transporteur » (référence produit).
- **P4-06** Validation par lot + étiquettes PDF.
- **P4-07** Synchronisation du suivi adaptative + mapping des statuts + timeline.
- **P4-08** File de suivi agent (remarques `add/maj`, demande de retour).
- **P4-09** Retours (`valid/returns`) et encaissement/paiement transporteur.
- **Checkpoint 4** : vérification des 🔶 de `ecotrack.md` sur le compte réel ; scénario
  timeout ⇒ réconciliation ⇒ zéro doublon ; quota respecté sous charge ; colis suivi jusqu'à
  « payé ».

## Phase 5 — Pixels et CAPI
- **P5-01** Configuration des pixels par boutique (secrets, déclencheur, mode test) + docs
  officielles consignées dans `docs/integrations/`.
- **P5-02** Événements navigateur (chargement différé, `event_id`, CSP).
- **P5-03** Envoi serveur Meta Conversions API.
- **P5-04** Envoi serveur TikTok Events API.
- **P5-05** Déclencheur Purchase branché sur les transitions + journal dans la timeline.
- **Checkpoint 5** : événements de test reçus côté Meta et TikTok ; déduplication vérifiée ;
  aucun double Purchase en rejouant les jobs ; données hachées uniquement.

## Phase 6 — Mise en production MVP
- **P6-01** VPS de production (fournisseur choisi par le propriétaire : Oracle Always Free,
  Hostinger, Hetzner…) : script de provisioning (pare-feu limité à Cloudflare, SSH par clé, mises
  à jour de sécurité automatiques), Docker Compose de production (images amd64/arm64), Caddy,
  zones Cloudflare (cache, WAF), script de déploiement, migration des données de test si
  souhaitée, guide pas à pas. **Aucune vente réelle avant cette étape.**
- **P6-02** Observabilité : suivi d'erreurs, alertes (DLQ, envois en erreur, quota transporteur).
- **P6-03** Sauvegardes chiffrées vers un stockage externe gratuit + test de restauration +
  procédure de repli vers un autre VPS (exercée une fois).
- **P6-04** Revue de sécurité complète (en-têtes, CSP, limites CDN/API, dépendances, secrets).
- **P6-05** Tests de charge (création de commande, liste OMS, synchro) + correctifs.
- **P6-06** Checklist de mise en ligne et runbook (incidents transporteur/pixels, rotation de clés).
- **Checkpoint 6** : production en ligne, restauration testée, alertes reçues lors d'un test.

## Phase 7 — Stock
- **P7-01** Emplacements, ledger, `StockLevel` (domaine + API).
- **P7-02** Réservation à la confirmation, sortie à l'expédition, retour, libération.
- **P7-03** Transferts maison ↔ transporteur, ajustements, inventaire.
- **P7-04** Rapprochement avec le stock transporteur (`get/products/list`) et écarts.
- **P7-05** Alertes de rupture, affichage « épuisé » sur le store, écrans stock.
- **Checkpoint 7** : somme du ledger = niveaux de stock (job de réconciliation) ; scénarios
  concurrents sans survente.

## Phase 8 — Agents et paie
- **P8-01** Barèmes datés (agent × produit > produit > agent > boutique).
- **P8-02** Gains à la livraison + contre-passation (idempotent) + **rattrapage** depuis
  l'historique depuis la mise en ligne.
- **P8-03** Paiements (sélection des gains, méthode, référence, relevé agent).
- **P8-04** Dashboard agent + vue manager.
- **Checkpoint 8** : rejouer les événements ne crée aucun gain en double ; total des paiements =
  somme des gains payés.

## Phase 9 — Statistiques
- **P9-01** Agrégats (`FunnelDaily`, vues), fuseau Africa/Algiers.
- **P9-02** Dépenses pub et autres dépenses (taux de change saisi).
- **P9-03** Dashboard global (funnel, taux, CA, profit net).
- **P9-04** Rapports par produit, wilaya, agent, source, transporteur + exports.
- **Checkpoint 9** : chiffres recoupés avec un calcul manuel sur jeu de données seedé.

## Phase 10 — Landing builder et personnalisation
- **P10-01** Bibliothèque complète de blocs (PRD §19).
- **P10-02** Éditeur (ordre, propriétés, autosave).
- **P10-03** Aperçu iframe (jeton brouillon, mobile/desktop, ar/fr).
- **P10-04** Publication versionnée, purge CDN, retour arrière.
- **P10-05** Thème et personnalisation du store.
- **P10-06** Modèles et duplication.
- **Checkpoint 10** : landing créée et publiée sans code, Lighthouse ≥ 90 maintenu.

## Phase 11 — IA
- **P11-01** Identifiants fournisseurs chiffrés, test, liste des modèles, interface fournisseur.
- **P11-02** Génération de textes ar/fr avec garde-fous.
- **P11-03** Génération de landing (blocs validés par schéma) et de thème.
- **P11-04** Journal, coûts, plafond mensuel.
- **Checkpoint 11** : génération → brouillon valide → publication humaine ; plafond respecté.

## Phase 12 — Application mobile (Expo)
À détailler en fin de P11 : confirmation et suivi pour les agents, dashboard marchand, sur
l'API existante (authentification Bearer).
