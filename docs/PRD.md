# PRD — DZ Commerce OS

> Version 1.0 — 2026-11-01 — reconstruite en session 1 à partir du brief du propriétaire.
> Source de vérité fonctionnelle. Toute évolution passe par une modification de ce fichier
> (et un ADR dans `docs/DECISIONS.md` si elle touche l'architecture).
> Les hypothèses prises par défaut sont marquées **[H]** et listées en §26.

---

## 1. Vision et objectifs

DZ Commerce OS est le système e-commerce personnel d'un marchand unique vendant en **paiement à
la livraison (COD)** en Algérie. Il couvre toute la chaîne : boutique ultra-rapide → commande →
anti-fraude → confirmation téléphonique → expédition via transporteur → suivi → livraison →
encaissement → paie des agents → mesure publicitaire → statistiques.

Objectifs mesurables :
- **Conversion** : formulaire COD sans friction, LCP < 2,5 s sur mobile 4G, Lighthouse mobile ≥ 90.
- **Taux de livraison** : réduire les fausses commandes et les retours (anti-fraude, confirmation
  rigoureuse, suivi actif des colis en difficulté).
- **Productivité** : un agent traite une commande en quelques secondes (raccourcis clavier, file
  de travail, zéro rechargement).
- **Fiabilité** : jamais de colis en double, jamais de commande perdue, aucun événement pixel
  envoyé deux fois.
- **Pilotage** : profit net réel par produit, wilaya, agent et source.

## 2. Utilisateurs et rôles

| Rôle | Qui | Accès |
|---|---|---|
| `OWNER` | Le marchand | Tout, y compris secrets, paie, suppression, paramètres. 2FA obligatoire |
| `ADMIN` | Bras droit éventuel | Tout sauf gestion des OWNER et lecture des secrets en clair (jamais possible). 2FA obligatoire |
| `CONFIRMATION_AGENT` | Agent de confirmation | Sa file de confirmation, fiches commandes concernées, son dashboard et ses gains |
| `FOLLOWUP_AGENT` | Agent de suivi | Sa file de suivi (colis expédiés en difficulté), son dashboard et ses gains |

- Un utilisateur peut cumuler les deux rôles d'agent.
- L'accès d'un agent est limité aux **boutiques** qui lui sont attribuées.
- Les agents **ne voient pas** : prix de revient, profit, dépenses pub, gains des autres agents,
  secrets, paramètres.
- Client final : visiteur anonyme du store (aucun compte client en v1).

## 3. Glossaire

| Terme | Définition |
|---|---|
| COD | Paiement à la livraison : le livreur encaisse `codAmount` et le reverse au marchand |
| Wilaya / commune | Divisions administratives algériennes (découpage en vigueur : **69 wilayas, 1541 communes**, loi n° 26-06 du 4 avril 2026 ; voir `packages/geo/SOURCE.md`) |
| Stop desk | Livraison en point relais/bureau du transporteur (moins cher que domicile) |
| Confirmation | Appel du client par un agent pour valider la commande avant expédition |
| Suivi | Traitement des colis expédiés en difficulté (client injoignable, report, suspendu) |
| Tracking | Numéro de colis attribué par le transporteur |
| Ledger | Journal immuable de mouvements (stock, gains) ; les soldes en sont dérivés |
| Purchase trigger | Moment où l'événement publicitaire `Purchase` est envoyé |
| CAPI | Meta Conversions API ; Events API = équivalent TikTok |

## 4. Multi-boutique et domaines

- Plusieurs **boutiques** (niches, marques) sont gérées par un même OMS. Chacune a : nom, slug,
  domaines (1..n, dont un principal), langues (ar par défaut, fr), thème, pixels, tarifs de
  livraison, compte transporteur par défaut, préfixe de numéro de commande, paramètres
  anti-fraude et déclencheur Purchase.
- Le store résout la boutique à partir du **nom d'hôte** de la requête. Hôte inconnu → 404.
- Clients, liste noire et historique de risque sont **partagés entre boutiques** (même marchand).
- Les statistiques sont filtrables par boutique et consolidées.

## 5. Catalogue

- **Produit** : nom interne, slug, statut (`DRAFT`, `ACTIVE`, `ARCHIVED`), titre et description
  localisés (ar, fr), médias ordonnés, catégorie optionnelle, SEO (titre, description, image OG).
- **Variante** : SKU unique par boutique, options (ex. couleur, taille), prix de vente, prix barré
  optionnel, **prix de revient** (pour le profit), poids, actif/inactif, référence produit chez le
  transporteur (stock délocalisé). Un produit sans option a une variante unique implicite.
- **Médias** : téléversés une fois, déclinés automatiquement en AVIF et WebP à plusieurs largeurs,
  texte alternatif localisé.
- Duplication d'un produit (avec variantes, offres, landing).

## 6. Offres, upsell et cross-sell

- **Offres par quantité** (paliers) par produit : quantité, prix total, libellé localisé, badge
  (« الأكثر طلبا »), livraison offerte optionnelle, palier par défaut. Le client choisit un palier
  dans le formulaire.
- **Upsell après soumission** : après création de la commande, une offre complémentaire (produit,
  prix spécial, délai d'affichage) est proposée ; accepter **ajoute la ligne à la même commande**
  (pas de nouvelle commande) tant qu'elle n'est pas confirmée. Une seule fois par commande.
- **Cross-sell dans le formulaire** : case à cocher « ajouter X pour Y DA ».
- **Prix** : toujours **recalculés côté serveur** à partir du catalogue ; les montants envoyés par
  le navigateur ne sont qu'indicatifs.
- Codes promo : hors v1 **[H]**.

## 7. Store (vitrine)

- Pages : accueil (liste de produits ou landing principale), produit, landing (§19), merci,
  pages statiques (contact, conditions, retours), 404.
- **Arabe RTL par défaut + français** ; sélecteur de langue ; URL localisées (`/fr/...`).
- **Performance** : rendu serveur, HTML mis en cache en CDN par hôte, **JS limité aux îlots
  interactifs** (formulaire COD, galerie, upsell) ; images responsives AVIF/WebP avec dimensions
  explicites ; polices auto-hébergées avec `font-display: swap` ; scripts pixels chargés
  après l'interaction ou en période d'inactivité.
- Budgets : LCP < 2,5 s (mobile 4G), CLS < 0,1, INP < 200 ms, JS initial < 50 Ko gzip sur
  produit et landing, Lighthouse mobile performance ≥ 90.
- Personnalisation (§19) : couleurs, typographie, logo, rayon des angles, en-tête/pied de page,
  bandeau d'annonce, bouton WhatsApp flottant optionnel.
- Capture de l'attribution : paramètres UTM, `fbclid`, `ttclid`, référent, landing d'entrée →
  conservés en cookie first-party 30 jours **[H]** et rattachés à la commande.

## 8. Formulaire COD et création de commande

### Champs
| Champ | Règle |
|---|---|
| Nom complet | Obligatoire, 3–60 caractères, lettres arabes/latines, espaces, tirets |
| Téléphone | Obligatoire, mobile algérien normalisé : `05/06/07` + 8 chiffres ; accepte `+213`/`00213` ; stocké en E.164 |
| Téléphone 2 | Optionnel, mêmes règles, différent du premier |
| Wilaya | Liste (ar/fr selon la langue), seules les wilayas desservies par la boutique |
| Commune | Liste filtrée par wilaya ; pour le stop desk, seules les communes avec bureau |
| Type de livraison | Domicile / Stop desk (si disponible pour la commune) |
| Adresse | Obligatoire pour domicile (5–200 caractères), optionnelle pour stop desk |
| Palier d'offre / variante | Selon le produit |
| Remarque | Optionnelle, 200 caractères |

### Comportement
- **Frais de livraison dynamiques** : recalculés à chaque changement de wilaya/type à partir des
  tarifs de la boutique (§14) ; total affiché en direct ; livraison offerte si le palier le prévoit.
- Validation instantanée côté client **et** revalidation stricte côté serveur (schéma partagé).
- **Idempotence** : une clé générée à l'affichage du formulaire accompagne la soumission ; une
  double soumission (double clic, réseau instable) renvoie **la même commande**.
- Anti-fraude (§9) évalué à la création.
- Page **merci** : récapitulatif, numéro de commande, message « nous allons vous appeler »,
  upsell éventuel, événements pixels (§10).
- Sans JavaScript, le formulaire reste soumissible (amélioration progressive) **[H]**.
- Commande abandonnée (formulaire commencé, non soumis) : téléphone saisi conservé comme
  « prospect » si le consentement est explicite — **hors v1** **[H]**.

## 9. Anti-fraude

- **Signaux** : téléphone invalide ou sur liste noire ; IP / appareil sur liste noire ; vélocité
  (N commandes par IP/heure, par téléphone/jour, par appareil) ; doublon (même téléphone + même
  produit sous 48 h **[H]**) ; historique client (taux de retours et de refus) ; temps de
  remplissage anormalement court ; champ pot de miel rempli ; nom ou adresse incohérents
  (trop courts, répétitions, caractères aléatoires) ; trafic hors Algérie ou proxy connu ;
  agent utilisateur de robot.
- **Score 0–100** explicable (chaque signal stocké avec son poids) ; seuils réglables par boutique :
  accepter (< 30), à revoir (30–69), bloquer (≥ 70) **[H]**. Règles dures : téléphone sur liste
  noire ⇒ blocage.
- **Commande bloquée** : enregistrée au statut `BLOCKED` (jamais supprimée), visible dans un onglet
  dédié, libérable par un ADMIN. Par défaut le client voit la page de succès normale
  (« blocage silencieux ») ; **aucun événement pixel** n'est émis.
- **Doublons** : la nouvelle commande est liée à l'originale et signalée ; l'agent choisit de
  fusionner (annulation motif `DUPLICATE`) ou de garder.
- **Liste noire** : téléphone, IP, appareil ; ajout depuis la fiche commande (avec motif),
  expiration optionnelle, audit.
- OTP SMS : hors v1 **[H]**.

## 10. Pixels et tracking publicitaire

- Plateformes : **Meta** (Pixel + Conversions API) et **TikTok** (Pixel + Events API). Plusieurs
  pixels par plateforme et par boutique.
- Événements navigateur : `PageView`, `ViewContent`, `InitiateCheckout`/`AddToCart` à la première
  interaction avec le formulaire, `Purchase` uniquement si le déclencheur est « à la soumission ».
- **Déclencheur Purchase réglable par boutique** : `ON_SUBMIT`, `ON_CONFIRMED`, `ON_SHIPPED`,
  `ON_DELIVERED`. Au-delà de la soumission, l'envoi est **uniquement serveur**.
- **Envoi serveur** de chaque événement pertinent avec `event_id` identique au navigateur
  (déduplication), données utilisateur **hachées SHA-256** (téléphone E.164, prénom, nom, ville,
  pays), IP et user-agent de la commande, cookies `_fbp`/`_fbc`, `ttclid`/`_ttp`, `external_id`.
- Valeur = montant des produits (ou total avec livraison, au choix), devise DZD.
- Garanties : **jamais deux envois** du même événement pour un même pixel (unicité
  pixel × événement × `event_id`) ; retries avec backoff ; journal consultable (payload haché,
  réponse, erreurs) ; mode test (`test_event_code`).
- Commandes bloquées ou annulées avant le déclencheur : pas de `Purchase`.
- Les payloads exacts suivent la **documentation officielle en vigueur** de chaque plateforme
  au moment de l'implémentation (version d'API vérifiée, jamais supposée).

## 11. OMS — gestion des commandes

- Application **séparée du store** (sous-domaine admin), en **français et anglais**.
- **Liste** virtualisée (milliers de lignes fluides), colonnes configurables, filtres combinables
  (boutique, statut, dates, wilaya, produit, agent, source/UTM, score de fraude, transporteur),
  recherche instantanée (numéro, téléphone, nom, tracking), vues enregistrées, export CSV
  (protégé contre l'injection de formules).
- **Fiche commande** : client (avec historique : nombre de commandes, livrées, retournées),
  lignes, totaux, livraison, attribution, score de fraude détaillé, envoi transporteur,
  **timeline** unifiée (changements de statut, appels, remarques internes, événements
  transporteur, remarques livreur, événements pixels, modifications).
- **Statuts** : machine à états (ARCHITECTURE §4) ; toute transition passe par le même service
  côté API ; transition forcée réservée OWNER/ADMIN avec motif obligatoire et audit.
- **Remarques** : internes (équipe) et transporteur (envoyées via `add/maj` après expédition).
- **Modification** d'une commande (articles, adresse, livraison) tant qu'elle n'est pas validée
  chez le transporteur ; recalcul des totaux ; historisé.
- **Actions groupées** : assigner, changer de statut (si autorisé), créer les envois, valider
  l'expédition, imprimer les étiquettes, exporter. Toute action critique demande confirmation.

## 12. Confirmation et suivi (agents)

### Confirmation
- **File de travail** : commandes `NEW`, `NO_ANSWER` et `CALLBACK` échues, triées par priorité
  (rappels échus, puis les plus anciennes) ; l'agent prend « la suivante » (**verrouillage**
  exclusif de 10 min **[H]**, renouvelé pendant l'activité) ; assignation manuelle possible.
- Écran de confirmation : infos client et historique, script d'appel, liens `tel:` et WhatsApp,
  édition rapide (commune, type de livraison, quantité, palier), résultat d'appel.
- **Résultats d'appel** : pas de réponse, occupé, éteint, faux numéro, rappel demandé
  (date/heure), confirmée, annulée (motif). Chaque tentative est journalisée.
- Après N tentatives sans réponse (défaut 5 **[H]**) sur M jours, annulation automatique
  proposée (motif `UNREACHABLE`).
- **Raccourcis clavier** : suivante, confirmer, pas de réponse, rappel, annuler, copier le
  téléphone, ouvrir WhatsApp, palette de commandes.
- Report d'expédition : commande confirmée avec date d'envoi souhaitée.

### Suivi
- File : colis `DELIVERY_ISSUE` (suspendus, tentatives échouées, reportés), colis immobiles depuis
  plus de X jours **[H : 3]**, retours demandés.
- Actions : appeler le client, ajouter une remarque transporteur, demander le retour, noter le
  résultat. Chaque action est journalisée.

### Dashboard personnel agent
Commandes traitées (jour/semaine/mois), taux de confirmation, taux de livraison de ses commandes
confirmées, gains en attente/payés, historique de ses paiements.

## 13. Expédition et transporteurs

- **Adaptateur transporteur** (interface commune) ; **EcoTrack en premier** (plusieurs sociétés
  utilisent EcoTrack, chacune avec son URL et son token). Spécification :
  `docs/integrations/ecotrack.md`.
- **Comptes transporteur** : nom, fournisseur, URL de base, token chiffré, paramètres (validation
  automatique ou manuelle, type par défaut, poids par défaut). Bouton « tester la connexion ».
- **Création de l'envoi** : automatique à la confirmation (défaut) ou manuelle ; conversion
  géographique (§14) ; montant COD = total commande ; référence = identifiant unique de commande ;
  **idempotence stricte** (jamais de colis en double).
- **Validation (expédition)** : manuelle par lot (défaut **[H]**) ou automatique ; impression des
  étiquettes PDF par lot.
- **Suivi automatique** : synchronisation périodique adaptative des colis actifs ; chaque
  changement alimente la timeline et la machine à états ; les colis livrés restent suivis jusqu'au
  paiement par le transporteur (encaissement).
- **Retours** : statut retour, validation de la réception physique (`valid/returns`), réintégration
  en stock.
- **Erreurs** : wilaya non desservie, commune non mappée, token invalide, limite de taux → message
  actionnable sur la commande, file « envois en erreur », alerte.
- Transporteurs suivants (Yalidine, ZR Express, Noest, Maystro…) : hors v1, l'interface doit
  permettre de les ajouter sans toucher au cœur **[H]**.

## 14. Géographie algérienne

- Référentiel canonique : wilayas et communes avec noms **arabe, français et ASCII**, codes
  officiels. Le découpage peut évoluer : aucun code n'est figé dans le code source, tout vient des
  données.
- Le client choisit en arabe (ou en français) ; le système stocke l'**identifiant canonique**.
- **Correspondance par transporteur** : pour chaque compte transporteur, table wilaya/commune
  canonique → nom/ID attendu par le transporteur, alimentée par synchronisation
  (`get/wilayas`, `get/communes`), rapprochement automatique (exact → normalisé → approché) et
  **écran de validation manuelle** des cas douteux. Disponibilité stop desk et activation
  synchronisées.
- **Tarifs** : prix de livraison facturé au client par boutique × wilaya × type (domicile / stop
  desk), modifiables ; coût réel transporteur synchronisé (`get/fees`) pour le calcul du profit ;
  pré-remplissage des tarifs client depuis les coûts transporteur.

## 15. Stock

- **Emplacements** : « chez moi » (entrepôt) et « chez le transporteur » (un par compte transporteur
  qui stocke) ; extensible.
- **Ledger de mouvements** immuable : entrée (réception fournisseur), transfert sortant/entrant,
  sortie expédition, retour, ajustement (inventaire), perte/casse. Chaque mouvement : variante,
  emplacement, quantité signée, motif, coût unitaire éventuel, auteur, lien commande/envoi.
- **Réservations** : à la confirmation, le stock est réservé sur l'emplacement d'expédition ;
  consommé à l'expédition ; libéré à l'annulation.
- Disponible = en stock − réservé. Rupture : alerte et option de masquer/afficher « épuisé » sur
  le store.
- **Stock transporteur** : rapprochement périodique avec `get/products/list` ; écarts signalés,
  jamais corrigés silencieusement.
- Seuils d'alerte par variante ; valorisation du stock au coût moyen pondéré **[H]**.

## 16. Agents, paie et paiements

- Comptes agents créés par OWNER/ADMIN : rôles, boutiques accessibles, actif/inactif.
- **Rémunération fixe par commande livrée** : quand une commande passe `DELIVERED`, un gain est
  créé pour l'agent qui l'a **confirmée** (rôle confirmation) et pour l'agent de **suivi** assigné
  (rôle suivi), s'il y en a un.
- **Montants** : par rôle, avec priorité au plus spécifique : agent × produit > produit > agent >
  défaut de la boutique. Barèmes datés (un changement n'affecte pas le passé).
- Commande finalement retournée après livraison : **écriture d'annulation** (contre-passation),
  jamais de modification de l'écriture d'origine.
- **Paiements** : le OWNER/ADMIN crée un paiement pour un agent sur une période (sélection des gains
  non payés), méthode (espèces, CCP, BaridiMob, virement, autre), référence ; un gain ne peut être
  payé qu'une fois. Relevé consultable par l'agent.

## 17. Statistiques

- **Funnel** : visites → vues produit → formulaires commencés → commandes → confirmées →
  expédiées → livrées (par boutique, produit, source, période).
- **Taux** : confirmation, annulation, livraison (sur expédiées), retour, délai moyen
  confirmation et livraison.
- **Financier** : CA livré, CA encaissé (payé par le transporteur), coût des marchandises, frais de
  livraison et de retour réels, gains agents, dépenses publicitaires, **profit net** = CA livré −
  coût marchandises − frais transport (livraison + retours) − gains agents − dépenses pub − autres
  dépenses.
- **Ventilations** : produit, variante, wilaya, agent, source/UTM/campagne, transporteur, jour.
- **Dépenses publicitaires** : saisie quotidienne par plateforme/produit (montant en devise + taux
  de conversion en DZD saisi par le marchand) ; import API Meta/TikTok plus tard **[H]**.
- Fuseau d'affichage **Africa/Algiers** ; export CSV.

## 18. Modèle de données (entités)

Le schéma détaillé (Prisma) est dans `docs/ARCHITECTURE.md` §3. Entités :

| Domaine | Entités |
|---|---|
| Plateforme | `Store`, `StoreDomain`, `StoreCounter`, `AppSetting` |
| Identité & sécurité | `User`, `UserStoreAccess`, `Session`, `AuditLog`, `Secret`, `IdempotencyKey` |
| Géographie | `Wilaya`, `Commune`, `ShippingRate` |
| Transporteurs | `CarrierAccount`, `CarrierWilayaMap`, `CarrierCommuneMap`, `CarrierDesk`, `CarrierFee` |
| Catalogue | `Product`, `ProductVariant`, `Media`, `ProductMedia`, `OfferTier`, `Upsell` |
| Clients & fraude | `Customer`, `BlacklistEntry` |
| Commandes | `Order`, `OrderItem`, `OrderEvent` (timeline), `CallAttempt`, `OrderLock` (via colonnes) |
| Expédition | `Shipment`, `ShipmentEvent` |
| Stock | `StockLocation`, `StockMovement`, `StockLevel`, `StockReservation`, `CarrierStockSnapshot` |
| Agents | `CompensationRule`, `AgentEarning`, `Payout` |
| Tracking | `PixelConfig`, `TrackingEvent`, `StoreEvent`, `FunnelDaily` |
| Finances | `AdSpend`, `Expense` |
| Contenu | `Page` (landing/statique), `PageVersion`, thème dans `Store` |
| IA | `AiCredential`, `AiGeneration` |
| Infrastructure | `OutboxEvent` (+ tables internes de la file de jobs) |

Invariants clés : montants en **entiers DZD** ; horodatages en UTC ; une seule expédition active
par commande ; un `event_id` par pixel et par événement ; écritures de ledger jamais modifiées ;
numéro de commande unique par boutique.

## 19. Landing page builder et personnalisation

- Une **page** = liste ordonnée de **blocs** typés et versionnés (schéma partagé), contenus
  localisés ar/fr. Types v1 : héros, galerie, bénéfices, vidéo, texte riche, image, avant/après,
  témoignages (**réels uniquement**, avec source), FAQ, tableau comparatif, garantie, offres par
  quantité, **formulaire COD**, CTA collant, compte à rebours **uniquement lié à une date de fin
  réelle**, séparateur.
- Éditeur dans l'admin : ajout/suppression/réordonnancement, panneau de propriétés, **aperçu
  réel** (iframe du store en mode brouillon, mobile/desktop, ar/fr), modèles réutilisables,
  duplication.
- Publication versionnée (historique, retour arrière) ; purge du cache CDN à la publication.
- Le rendu des blocs non interactifs ne produit **aucun JavaScript**.
- Personnalisation du store : thème (tokens), en-tête, pied de page, pages statiques, menu.
- Interdits de contenu : faux avis, faux compteurs de stock ou de visiteurs, fausse urgence.

## 20. Intégrations IA

- Clés API des fournisseurs (Anthropic en premier, interface ouverte à d'autres) saisies dans le
  dashboard, **chiffrées**, testables, modèle choisi dans la liste fournie par le fournisseur.
- Générations : landing complète (blocs) à partir d'une fiche produit, textes (titres,
  descriptions, FAQ, bénéfices) en arabe algérien/standard et en français, propositions de thème.
- Le résultat est toujours un **brouillon** relu et publié par un humain ; consignes système
  interdisant les faux témoignages, les allégations de santé non prouvées et la fausse urgence.
- Journal des générations (tokens, coût estimé), plafond mensuel de dépense configurable.

## 21. Paramètres

Par boutique : général, domaines, langues, thème, tarifs de livraison, transporteur par défaut,
anti-fraude, pixels et déclencheur Purchase, numérotation. Globaux : utilisateurs et rôles,
comptes transporteur, correspondances géographiques, emplacements de stock, barèmes de paie,
clés IA, jobs en échec (consultation et relance).

## 22. Sécurité, confidentialité et conformité

- RBAC appliqué **côté API** sur chaque route et chaque ressource ; l'interface ne fait que
  masquer.
- Mots de passe Argon2id ; sessions révocables ; 2FA TOTP obligatoire pour OWNER/ADMIN.
- Secrets (tokens transporteur, pixels, clés IA) **chiffrés** au repos, jamais renvoyés en clair
  (affichage masqué), jamais journalisés.
- Limitation de débit sur les points publics (commande, connexion) ; WAF/CDN devant.
- Journal d'audit des actions sensibles (connexion, rôles, transitions forcées, annulations,
  prix, liste noire, secrets, paiements, ajustements de stock, exports).
- En-têtes de sécurité (CSP, HSTS, etc.) ; protection CSRF ; CORS restreint.
- Données personnelles (loi algérienne n° 18-07) : minimisation, accès restreint, journaux sans
  données personnelles, IP et user-agent anonymisés après 12 mois **[H]**.

## 23. Exigences non fonctionnelles

- Disponibilité visée 99,5 % ; dégradation gracieuse si le transporteur ou une plateforme
  publicitaire est indisponible (jamais bloquer la prise de commande).
- Volume dimensionnant **[H]** : 2 000 commandes/jour, 20 agents simultanés, 10 000 colis actifs.
- Sauvegardes quotidiennes de la base + export chiffré externe ; restauration testée à chaque
  checkpoint de phase majeure.
- Observabilité : logs structurés sans données personnelles, identifiant de requête, suivi des
  erreurs, santé des jobs, alertes (jobs en échec, envois en erreur, quota transporteur).
- Accessibilité : formulaires étiquetés, contrastes AA, navigation clavier.

## 24. Application mobile (plus tard)

Application Expo consommant **la même API** (REST + OpenAPI, authentification par jeton) :
confirmation et suivi pour les agents, tableau de bord pour le marchand. Aucune logique métier
spécifique au mobile côté serveur.

## 25. Hors périmètre v1

Multi-marchands/SaaS, comptes clients, paiement en ligne, codes promo, OTP SMS, programme de
fidélité, marketplace, application mobile (phase ultérieure), import de données historiques,
transporteurs autres qu'EcoTrack.

## 26. Questions ouvertes et hypothèses

### Tranchées en session 1 (2026-11-01)
| # | Question | Décision |
|---|---|---|
| Q1 | Une ou plusieurs boutiques ? | **Plusieurs**, `storeId` partout dès le départ |
| Q2 | Hébergement | **Gratuit au début** : test non commercial sur Vercel Hobby + Neon Free ; production sur un VPS (Oracle Always Free gratuit ou VPS payant) choisi avant toute vente réelle (ADR-0013) |
| Q3 | Accès EcoTrack | Doc officielle Postman + token disponibles (token jamais commité) |
| Q4 | Push git | Push sur la branche de travail après chaque commit ; jamais `main`, jamais de force-push |
| Q5 | Langue de l'admin | **Français + anglais** (i18n complet) |
| Q6 | Paie des agents | **Fixe par commande livrée**, par rôle, modulable agent/produit, contre-passée si retour |
| Q7 | Reprise de données | **Aucune** ; on part de zéro |

### Hypothèses par défaut [H] — à confirmer ou corriger à tout moment
1. Nom de la société EcoTrack et URL de base : fournis au moment de la phase transporteur.
2. Validation (expédition) chez le transporteur : manuelle par lot par défaut, automatique en option.
3. Doublon = même téléphone + même produit sous 48 h.
4. Seuils anti-fraude 30 / 70 ; blocage silencieux ; pas d'OTP SMS.
5. Verrou de commande agent : 10 min ; 5 tentatives sans réponse avant annulation proposée.
6. Colis « immobile » après 3 jours sans événement.
7. Cookie d'attribution first-party 30 jours ; pas de bandeau de consentement par défaut (à
   valider juridiquement).
8. Codes promo, OTP SMS, prospects (formulaires abandonnés) : hors v1.
9. Dépenses pub saisies manuellement (avec taux de change saisi) ; import API plus tard.
10. Valorisation du stock au coût moyen pondéré.
11. Volume dimensionnant : 2 000 commandes/jour, 20 agents.
12. Anonymisation IP/user-agent après 12 mois.
13. Les assets de marque, inspirations et échantillons (`docs/assets`, `docs/inspiration`,
    `docs/samples`) sont vides au départ : à fournir quand disponibles.
14. Déclencheur Purchase par défaut d'une nouvelle boutique : `ON_CONFIRMED` (réglable).

### Encore ouvertes (non bloquantes pour la Phase 0)
- Sémantique exacte des champs EcoTrack marqués 🔶 dans `docs/integrations/ecotrack.md`.
- Mode « stock chez le transporteur » : quels produits, quelle société ?
- Domaines définitifs des boutiques et de l'admin (seul coût d'infrastructure : ~10 $/an par
  domaine).
- Comptes Vercel (Hobby) et Neon (Free) à créer avant P0-12 (gratuits, sans carte bancaire).
- Fournisseur du VPS de production à choisir avant P6 (Oracle Always Free exige une carte
  bancaire internationale à l'inscription).
- Charte graphique (logo, couleurs) de la première boutique.
