---
name: dz-geo
description: Géographie algérienne dans DZ Commerce OS — référentiel wilayas/communes (arabe, français, ASCII), normalisation des noms, rapprochement avec les noms attendus par un transporteur (EcoTrack), tarifs de livraison par wilaya, disponibilité stop desk. À charger pour tout code de formulaire wilaya/commune, mapping transporteur ou tarifs.
---

# Géographie DZ

## Référentiel canonique (`packages/geo`)
- Wilayas : `id` = code officiel, `nameAr`, `nameFr`, `nameAscii`. Communes : `id` stable,
  `wilayaId`, `nameAr`, `nameFr`, `nameAscii`, code postal si connu.
- Données versionnées en JSON dans le dépôt (source et licence notées dans un `SOURCE.md`),
  seedées en base. **Aucun code de wilaya en dur** dans le code applicatif : le découpage peut
  évoluer (nouvelles wilayas) — tout passe par les données.
- Vérifier le jeu de données : nombre de wilayas/communes attendu, pas de doublon
  (wilaya, nom normalisé), chaque commune rattachée à une wilaya existante.

## Normalisation (fonctions pures, testées)
- Arabe : supprimer tachkil et tatweel (`ـ`) ; `أ إ آ ٱ → ا` ; `ة → ه` ; `ى → ي` ; `ؤ → و` ;
  `ئ → ي` ; espaces multiples → un ; supprimer « بلدية » en tête si présent.
- Latin : minuscules, sans accents, `-`, `'`, `’` et espaces supprimés ; variantes fréquentes
  rapprochées pour le **matching uniquement** (`ou/u`, `dj/j`, `ch/sh`, `el/al` en préfixe,
  `aine/ain`, `ee/i`, doubles lettres simplifiées).
- La normalisation sert à **comparer**, jamais à afficher ni à envoyer.

## Correspondance transporteur
1. Synchroniser `get/wilayas` et `get/communes` du compte → table brute.
2. Rapprocher chaque commune canonique : exact (ASCII) → normalisé → approché (Jaro-Winkler/
   Levenshtein **dans la même wilaya uniquement**, seuil élevé).
3. Enregistrer `matchMethod` (`EXACT|NORMALIZED|FUZZY|MANUAL`) et `confidence`. FUZZY ⇒ à valider
   dans l'écran de revue ; MANUAL ⇒ choisi par un humain.
4. `has_stop_desk` et `is_active` synchronisés ; une commune inactive chez le transporteur n'est
   pas proposée pour ce transporteur.
5. Envoi d'un colis : uniquement `carrierCommuneName` d'une correspondance validée.

## Tarifs
- `ShippingRate` (boutique × wilaya × `HOME|STOP_DESK`) = prix client ; `CarrierFee` = coût réel
  (synchro `get/fees`, chaînes → entiers). Pré-remplissage des prix client depuis les coûts.
- Wilaya sans tarif actif ⇒ non proposée dans le formulaire.

## Tests incontournables
Noms avec hamza, ta marbuta, alif maqsura ; « Bab Ezzouar » vs « Bab El Zouar » ; communes
homonymes dans des wilayas différentes ; commune inexistante chez le transporteur.
