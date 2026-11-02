---
name: ecotrack
description: Règles pour tout code qui touche l'API EcoTrack dans DZ Commerce OS (adaptateur transporteur, création/validation/suppression de colis, étiquettes, synchro de suivi, référentiels wilayas/communes/bureaux/tarifs, stock transporteur, retours). À charger avant d'écrire ou de modifier l'adaptateur EcoTrack ou ses jobs.
---

# EcoTrack

**Seule source** : `docs/integrations/ecotrack.md` et le snapshot
`docs/integrations/ecotrack.postman.*.json`. Si un champ, endpoint ou statut n'y est pas :
**ne pas l'utiliser**. Le signaler et demander (ou vérifier en lecture seule sur le compte réel
avec l'accord du propriétaire), puis mettre à jour la doc.

## Rappels critiques
- Base URL par société (`https://<société>.ecotrack.dz`) + `/api/v1/…` ; token Bearer ;
  `api_token` en query **uniquement** pour `validate/token` et `get/orders/status`.
- Création unitaire = **query string** ; masse (`create/orders`, ≤ 100) et `valid/returns` = JSON.
- `update/order` utilise d'autres noms (`client`, `tel`, `tel2`, `wilaya`, `product`) que
  `create/order` (`nom_client`, `telephone`, `telephone_2`, `code_wilaya`, `produit`).
- Erreurs métier en HTTP 200 (`success:false`, `error` 10001/10002/10003) ; validation en 422.
- Limites : 50/min, 1 500/h, 15 000/jour ; 429 + `Retry-After`. Budget interne 40/min.
- Pas de webhooks : synchro par `get/orders/status` (100 trackings/requête).
- Normaliser statuts/activités (minuscules, sans accents) : `payé_et_archivé` ≡ `paye_et_archive`,
  `Return_received` ≡ `return_received`.
- Montants reçus en chaînes → entiers validés.

## Architecture imposée
- Interface `CarrierAdapter` (package `carriers`) ; l'adaptateur ne connaît ni Prisma ni la
  machine à états : il traduit requêtes/réponses et lève des erreurs typées
  (`CarrierValidationError`, `CarrierBusinessError{code}`, `CarrierRateLimitError{retryAfter}`,
  `CarrierAuthError`, `CarrierUnavailableError`, `CarrierAmbiguousError`).
- Appels **uniquement depuis le worker**, file dédiée par compte transporteur, concurrence 1.
- Idempotence : `Shipment` créé en base **avant** l'appel ; `reference` = référence unique de la
  commande ; erreur ambiguë ⇒ statut `UNKNOWN` + job de **réconciliation** (`get/orders` sur la
  période, correspondance exacte de `reference`) avant toute relance.
- Communes envoyées = `CarrierCommuneMap.carrierCommuneName` uniquement ; non mappée ⇒ erreur
  actionnable, aucun appel.
- Logs : URL sans query string, jamais le token ni les données client.

## Tests
- Fixtures = exemples du snapshot (succès, 422, 10001, 10002, 10003, 429).
- Sérialiseurs create/update testés champ par champ ; mapping statuts testé exhaustivement
  (y compris inconnus) ; scénarios timeout → réconciliation → pas de doublon.
- Aucun appel réseau réel en CI ; fumée manuelle en lecture seule derrière
  `ECOTRACK_SMOKE=1`.
