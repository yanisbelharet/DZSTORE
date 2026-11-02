# Intégration EcoTrack

> **Source de vérité** : documentation officielle Postman « ECOTRACK API »
> <https://documenter.getpostman.com/view/14517169/Tz5je15g>
> Snapshot figé : [`ecotrack.postman.2026-11-01.json`](./ecotrack.postman.2026-11-01.json)
> (sha256 `2961b2962a5ae5ca0679c255316e3e48d6a3520cae52c2764be0e087ed6d553b`).
>
> Règle : **aucun endpoint, champ ou statut n'est utilisé s'il n'apparaît pas dans ce snapshot**.
> Tout ce qui est marqué 🔶 est une **interprétation** à confirmer sur le compte réel
> (appels en lecture seule d'abord) avant d'écrire du code qui en dépend.
> Si la doc en ligne change : nouveau snapshot daté + diff + mise à jour de ce fichier.

## 1. Généralités

| Élément | Valeur (doc officielle) |
|---|---|
| Base URL | Propre à chaque société de livraison : `https://<société>.ecotrack.dz` (variable Postman `{{url}}`), chemins sous `/api/v1/` |
| Auth | Token généré depuis le compte ECOTRACK, envoyé en **`Authorization: Bearer <token>`** |
| Exception auth | `GET /api/v1/validate/token` et `GET /api/v1/get/orders/status` prennent **`api_token` en query string** |
| Format | Création/modification **unitaire = paramètres en query string** (POST sans body). Création en masse et `valid/returns` = **body JSON** |
| Erreurs métier | Souvent **HTTP 200** avec `{ "success": false, "error": <code>, "message": "..." }` |
| Erreurs de validation | **HTTP 422** au format Laravel `{ "message": "...", "errors": { "<champ>": ["..."] } }` |
| Webhooks | **Aucun** dans la doc → suivi uniquement par **pull** |

### Limites de taux (par utilisateur ou adresse IP)

- **50 requêtes / minute**, **1 500 / heure**, **15 000 / jour**.
- Dépassement → **HTTP 429** `{"message": "Too Many Attempts."}` + en-tête **`Retry-After`** (secondes).
- En-têtes de suivi : `X-RateLimit-Limit`, `X-RateLimit-Limit-Remaining`, `X-RateLimit-Limit-Day`,
  `X-RateLimit-Remaining-Day`, `X-RateLimit-Reset-Day`, `X-RateLimit-Limit-Hour`,
  `X-RateLimit-Remaining-Hour`, `X-RateLimit-Reset-Hour`.
- Notre politique : budget interne **40 req/min** (marge de 20 %), lecture systématique des en-têtes
  `Remaining-*`, respect strict de `Retry-After`. Voir ARCHITECTURE §Jobs.

### Codes d'erreur métier documentés

| Code | Message | Contexte |
|---|---|---|
| `10001` | Commande non modifiable | `update/order`, `delete/order` après validation |
| `10002` | Pas de livraison pour la wilaya sélectionnée | `create/order` |
| `10003` | Le retour ne peut pas etre demandé pour cette commande | `ask/for/order/return` |

## 2. Endpoints

### Authentification
| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/v1/validate/token?api_token=` | Vérifie le token. Réponses : `VALID_TOKEN`, `INVALID_TOKEN`, `TOKEN_NOT_ALLOWED` (API désactivée pour le compte) |

### Commandes
| Méthode | Chemin | Notes |
|---|---|---|
| POST | `/api/v1/create/order?…` | 1 commande / requête. Succès : `{ "success": true, "tracking": "ECQFLD2103047673" }` |
| POST | `/api/v1/create/orders` | Body JSON `{ "orders": { "0": {...}, "1": {...} } }`, **max 100**. Résultat `results` indexé par `reference` |
| POST | `/api/v1/update/order?tracking=…` | Uniquement **après création et avant validation** |
| DELETE | `/api/v1/delete/order?tracking=…` | Tant que l'expédition n'est pas validée, sinon `10001` |
| POST | `/api/v1/valid/order?tracking=…&ask_collection` | **Valide et expédie**. Ensuite : plus de modification ni de suppression |
| POST | `/api/v1/valid/returns` | Body `{ "trackings": [...] }` → `{ "returned": "success" }` ou `{ "returned": "fail" }` |
| GET | `/api/v1/get/order/label?tracking=…` | Étiquette **PDF** (à proxifier côté serveur, jamais exposer le token) |

#### Paramètres de `create/order` (noms exacts)
`reference`, `nom_client`, `telephone`, `telephone_2`, `adresse`, `code_postal`, `commune`,
`code_wilaya`, `montant`, `remarque`, `produit`, `stock`, `quantite`, `produit_a_recuperer`,
`boutique`, `type`, `stop_desk`, `weight`, `fragile`, `gps_link`.

Obligatoires d'après l'exemple d'erreur 422 : **`nom_client`, `telephone`, `adresse`,
`code_wilaya`, `commune`, `montant`, `type`**.

Exemple d'erreur sur la commune (création en masse) : *« Commune mal écrite, ou désactivée. »* /
*« Wilaya mal écrite, ou désactivée. »* → la commune est envoyée **par son nom**, qui doit
correspondre exactement à la liste du transporteur (voir skill `dz-geo`).

#### ⚠️ Paramètres de `update/order` : noms DIFFÉRENTS
`tracking`, `reference`, `client`, `tel`, `tel2`, `adresse`, `code_postal`, `commune`, `wilaya`,
`montant`, `remarque`, `product`, `boutique`, `type`, `stop_desk`, `fragile`, `gps_link`.
→ deux sérialiseurs distincts dans l'adaptateur, testés séparément.

#### 🔶 À confirmer sur le compte réel
- Valeurs numériques de `type` : la doc liste « Livraison, Pick UP, Échange, Recouvrement » et
  l'exemple utilise `"type": "1"` pour une livraison. Le mapping complet 1→4 n'est **pas** écrit
  dans la doc.
- `stop_desk` : `0`/`1` dans l'exemple. Comment désigner le bureau choisi (commune du bureau ?
  `code_postal` = code station ?) n'est pas documenté.
- `stock` (`1` dans l'exemple), `quantite`, `produit` : sémantique du mode « stock chez le
  transporteur » (référence produit attendue ?).
- `montant` : montant à encaisser — inclut-il les frais de livraison ? (convention courante : oui,
  c'est le total COD).
- `weight`, `fragile`, `gps_link`, `boutique`, `ask_collection` : formats et effets.
- `reference` : longueur max et unicité côté transporteur.

### Suivi
| Méthode | Chemin | Notes |
|---|---|---|
| POST | `/api/v1/add/maj?tracking=…&content=…` | Ajoute une remarque visible par la société de livraison |
| GET | `/api/v1/get/maj?tracking=…` | Liste des remarques : `remarque`, `station`, `livreur`, `created_at`, `tracking` |
| POST | `/api/v1/ask/for/order/return?tracking=…` | Demande de retour (colis en livraison). Peut être ignorée par le transporteur |
| GET | `/api/v1/get/tracking/info?tracking=…` | Historique d'un colis (`activity[]`) |
| GET | `/api/v1/get/trackings/info?trackings[]=…` | Historique de **100 colis max** |
| GET | `/api/v1/get/orders?page=&start_date=&end_date=&tracking=` | Commandes **en cours**, 40/page, 90 derniers jours par défaut, **archivées exclues** |
| GET | `/api/v1/get/orders/status?api_token=&trackings=a,b&status=x,y` | Statut + activité de **100 trackings max** — endpoint principal de synchro |

### Configuration
| Méthode | Chemin | Réponse |
|---|---|---|
| GET | `/api/v1/get/wilayas` | `[{ "wilaya_id": 1, "wilaya_name": "Adrar" }, …]` (wilayas **actives** uniquement) |
| GET | `/api/v1/get/communes?wilaya_id=` | **Objet indexé** `{ "0": { "nom", "wilaya_id", "code_postal", "has_stop_desk", "is_active" }, … }` — pas un tableau |
| GET | `/api/v1/get/desks` | `{ "my_desk": { hub_id, hub_name, location{…}, working_hours[] }, "other_desks": [{ name, phone, phone2, code_wilaya, wilaya, commune, adresse, map }] }` |
| GET | `/api/v1/get/fees` | Clés `livraison`, `pickup`, `echnage` (**sic**), `recouvrement`, `retours` → `[{ wilaya_id, tarif, tarif_stopdesk }]` (montants en **chaînes**) |

### Produits (stock chez le transporteur)
| Méthode | Chemin | Réponse |
|---|---|---|
| GET | `/api/v1/get/products/list` | `{ products: [{ reference, barcode, title, is_active, image, stock_disponible, stock_reserve, stock_phisique (sic) }], pagination{…} }` (15/page) |

## 3. Statuts et activités

### `activity` (historique, `get/tracking(s)/info`)
| Clé | Signification (doc) |
|---|---|
| `order_information_received_by_carrier` | Commande enregistrée et validée par le vendeur |
| `picked` | Récupérée par le prestataire |
| `accepted_by_carrier` | Réceptionnée par le centre de tri (Hub ou Station) |
| `dispatched_to_driver` | Dispatchée au livreur (peut porter `scanLocation`) |
| `attempt_delivery` | Tentative de livraison |
| `return_asked` | Retour initié par le centre de tri |
| `return_in_transit` | Retour en transit |
| `Return_received` | Retour réceptionné par le vendeur (**R majuscule** dans la doc) |
| `livred` | Livrée |
| `encaissed` | Encaissée |
| `payed` | Paiement effectué |
| `notification_on_order` | Présente dans l'exemple de réponse, **absente** de la liste officielle |

### `status` (filtre, `get/orders/status`)
`prete_a_expedier`, `en_ramassage`, `en_preparation_stock`, `vers_hub`, `en_hub`, `vers_wilaya`,
`en_preparation`, `en_livraison`, `suspendu`, `livre_non_encaisse`, `encaisse_non_paye`,
`paiements_prets`, `paye_et_archive`, `retour_chez_livreur`, `retour_transit_entrepot`,
`retour_en_traitement`, `retour_recu`, `retour_archive`, `annule`, `all`.

Le même endpoint renvoie dans `activity[]` : `reason`, `details`, `station`, `driver`, `date`,
`time`, `postponed_to` (report de livraison), et pour certains statuts `driver_phone`,
`desk_*`, `estimated_fee`, `order_id`.

### ⚠️ Incohérences relevées dans la doc
- `get/orders` renvoie `"status": "payé_et_archivé"` (**accents**) alors que le filtre attend
  `paye_et_archive` → **normaliser** (minuscules, sans accents) avant tout mapping.
- `get/trackings/info` documente des libellés français (`'Prêt à expédier'`, `'En hub'`…) :
  **jamais** utilisés comme identifiants, seulement affichés.
- Activité `Return_received` avec majuscule → comparaison insensible à la casse.
- Clé `echnage` (faute) dans `get/fees`, champ `stock_phisique` (faute) dans `get/products/list`.
- Statut ou activité inconnu → conservé brut, commande signalée pour revue, **jamais** de crash.

### Mapping vers nos statuts (🔶 provisoire, à valider sur colis réels)
| Statut EcoTrack | Statut commande DZ OS | Encaissement |
|---|---|---|
| `prete_a_expedier` | `READY_TO_SHIP` 🔶 (créée, non validée ?) | — |
| `en_ramassage`, `en_preparation_stock` | `SHIPPED` | — |
| `vers_hub`, `en_hub`, `vers_wilaya`, `en_preparation` | `IN_TRANSIT` | — |
| `en_livraison` | `OUT_FOR_DELIVERY` | — |
| `suspendu` | `DELIVERY_ISSUE` | — |
| `livre_non_encaisse` | `DELIVERED` | `NOT_COLLECTED` |
| `encaisse_non_paye`, `paiements_prets` | `DELIVERED` | `COLLECTED` |
| `paye_et_archive` | `DELIVERED` | `PAID` |
| `retour_chez_livreur`, `retour_transit_entrepot`, `retour_en_traitement` | `RETURNING` | — |
| `retour_recu`, `retour_archive` | `RETURNED` | — |
| `annule` | revue manuelle (pas de transition automatique) | — |

## 4. Règles d'implémentation (non négociables)

1. **Jamais de colis en double** : `reference` = identifiant unique de notre commande ; un seul
   envoi `ACTIVE` par commande (index unique partiel) ; une erreur ambiguë (timeout, 5xx, coupure
   réseau) déclenche une **réconciliation** (`get/orders` sur la date de création, recherche par
   `reference`) **avant** tout nouvel essai.
2. Tous les appels passent par **une file dédiée par compte transporteur**, consommée par un seul
   worker à la fois, avec limiteur interne et respect de `Retry-After`.
3. Le token n'apparaît **jamais** dans les logs : les URL sont journalisées sans query string
   (`api_token` y figure pour `get/orders/status`).
4. Les réponses sont validées par schéma Zod tolérant (`passthrough`) : champ manquant = erreur
   typée, champ inconnu = ignoré mais conservé dans `raw`.
5. Les noms de commune envoyés proviennent **uniquement** de la table de correspondance
   transporteur (`CarrierCommuneMap`) ; une commune non mappée bloque l'envoi avec un message
   clair, sans appel.
6. Les montants reçus en chaînes (`"1300"`) sont convertis en entiers DZD et validés.
7. Tests : fixtures construites **à partir des exemples du snapshot** ; aucun appel réel en CI.
   Un test de fumée manuel en lecture seule (`validate/token`, `get/wilayas`) est disponible
   derrière un drapeau d'environnement.
