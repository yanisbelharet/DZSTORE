# Référentiel géographique — sources et licences

Données : `data/wilayas.json` (69 wilayas) et `data/communes.json` (1541 communes), produites par
`node packages/geo/scripts/build-dataset.ts` à partir des fichiers de `sources/`. Le script refuse
de produire un jeu incomplet ou ambigu (effectifs, doublons, nom arabe manquant).

## Découpage en vigueur : 69 wilayas, 1541 communes

| Texte | Contenu utilisé | Fichier |
|---|---|---|
| Loi n° 84-09 du 4 février 1984 relative à l'organisation territoriale du pays | numérotation : l'article *N* définit la wilaya *N − 4* | — |
| Loi n° 19-12 du 11 décembre 2019 (JORA n° 78 du 18 décembre 2019, édition française) | listes officielles des wilayas modifiées (01, 07, 08, 11, 30, 33, 39, 47) et créées (49 à 58, articles 52 bis à 52 bis 9) | `sources/jora-2019-078-loi-19-12.json` |
| Loi n° 26-06 du 4 avril 2026 (JORA n° 25 du 5 avril 2026, édition française) | « 69 wilayas et 1541 communes » (art. 3) ; listes des wilayas modifiées (03, 05, 07, 12, 13, 14, 17, 26, 28, 32) et créées (59 à 69, articles 52 bis 10 à 52 bis 20) | `sources/jora-2026-025-loi-26-06.json` |

- Les listes ont été extraites colonne par colonne des PDF officiels (joradp.dz), et chaque
  liste a exactement l'effectif annoncé par son article. Le JORA de 2019 contient une coquille
  (« 5 In Amguel », sans point), traitée au rang attendu.
- Codes 59 à 69 : **décret présidentiel n° 26-206 du 25 mai 2026 (JO n° 40 du 3 juin 2026)** —
  59 Aflou, 60 Barika, 61 El Kantara, 62 Bir El Ater, 63 El Aricha, 64 Ksar Chellala,
  65 Aïn Ouessara, 66 Messaad, 67 Ksar El Boukhari, 68 Bou Saâda, 69 El Abiodh Sidi Cheikh.
  Contrôlés sur le PDF du JO n° 40 (identiques à l'ordre des articles 52 bis 10 à 52 bis 20) ;
  la numérotation publiée par des médias est ignorée (ADR-0026). Codes figés par un test.
- Les noms français des communes des wilayas listées sont ceux du Journal officiel. Une wilaya
  porte le nom de son chef-lieu (première commune de la liste).
- Les textes officiels publiés au Journal officiel ne font pas l'objet d'un droit d'auteur
  (actes officiels).

## Noms arabes et wilayas inchangées : Wikidata (CC0)

- `sources/wikidata-2026-11-11.json` est un extrait Wikidata (licence **CC0**), lu le 2026-11-11
  sur `query.wikidata.org` : éléments « commune d'Algérie » (Q2989398), étiquettes ar/fr/en, et
  wilaya de rattachement dans le découpage à 58 wilayas (P131 → « province of Algeria »,
  code ISO 3166-2 P300).
- Les 31 wilayas inchangées depuis 1984 reprennent la composition Wikidata. Les communes des
  wilayas listées par les lois sont appariées à Wikidata dans leur wilaya d'origine (exact
  normalisé, puis Jaro-Winkler ≥ 0,88 sans ambiguïté). Les rapprochements approchés sont
  affichés par le script.
- **Identifiant d'une commune** : numéro de l'élément Wikidata (Q3307744 → 3307744). Il reste
  stable si la commune change de wilaya. Une commune absente de Wikidata reçoit un identifiant
  réservé ≥ 1 000 000 000.

## Wilaya d'origine, anciens noms, entrées à vérifier

- `legacyWilayaCode` : wilaya de la commune dans le modèle à 58 (2019–2026), encore utilisé par
  les transporteurs et les clients (un client d'Aflou choisit souvent « Laghouat »).
- `aliases` : `FORMER_NAME` pour une commune renommée par la loi 26-06 (Ouled Atia → Menaâ,
  Tlatet Eddouar → Eddouair, en arabe et en français), `VARIANT` pour une orthographe en usage
  (Khezarra / Kheraza) ou une étiquette Wikidata différente du nom officiel.
- `toVerify` : motif de doute, jamais corrigé sans source. El Borma (Ouargla ou Touggourt) suit
  le JO 2019 jusqu'à confrontation avec la liste des communes EcoTrack (phase 4).

## Corrections manuelles : `sources/overrides.json`

Chaque correction porte sa justification dans le fichier : alias d'orthographe (Tamenghasset =
Tamanrasset…), nom arabe d'un élément qui n'en a pas, commune absente de Wikidata, doublons
Wikidata exclus (vérifiés par les effectifs officiels des wilayas), renommages (`renames`),
variantes (`variants`) et doutes (`toVerify`).

## Vérifications

- Effectifs par wilaya comparés au tableau de fr.wikipedia « Wilayas d'Algérie » (utilisé comme
  contrôle uniquement, aucune donnée copiée) : identiques, sauf Ouargla (8 selon Wikipédia) et
  Touggourt (13), où le jeu suit le Journal officiel de 2019 (7 et 14) — écart à vérifier par un
  texte postérieur s'il existe.
- Total et effectifs des 21 wilayas listées en 2026 : conformes à la loi.

## Limites connues

- Aucun code postal par commune : aucune source libre vérifiée (seulement par wilaya).
- Le transporteur (EcoTrack) peut garder l'ancien découpage : la correspondance se fait par
  compte transporteur (skill `dz-geo`, phase 5), jamais en supposant les mêmes codes.
