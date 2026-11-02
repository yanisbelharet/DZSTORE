---
name: cod-antifraude
description: Anti-fraude des commandes COD dans DZ Commerce OS — validation des téléphones algériens, signaux (liste noire, vélocité, doublons, historique, pot de miel, temps de remplissage), score explicable, seuils, blocage silencieux, fusion des doublons. À charger pour tout code de création de commande, de scoring ou de liste noire.
---

# Anti-fraude COD

## Téléphone
- Normaliser : retirer espaces/points/tirets ; `+213`/`00213`/`213` → `0` ; valide si
  `^0[5-7]\d{8}$` (mobile). Stockage E.164 `+213XXXXXXXXX`. Fixe (`0[2-4]…`) refusé par défaut
  (paramétrable).
- Rejeter les suites triviales (`0555555555`, `0123456789`…) comme signal fort.

## Signaux (chacun : code, poids, détail) — `packages/domain/fraud`
| Code | Exemple de règle (poids par défaut, réglable) |
|---|---|
| `BLACKLIST_PHONE` | règle dure ⇒ BLOCK |
| `BLACKLIST_IP` / `BLACKLIST_DEVICE` | +60 |
| `VELOCITY_IP` | > 3 commandes/h même IP : +25 |
| `VELOCITY_PHONE` | > 2 commandes/24 h même téléphone (hors doublon) : +25 |
| `DUPLICATE` | même téléphone + même produit < 48 h : lien + flag (pas de score) |
| `HISTORY_RETURNS` | ≥ 2 retours et taux de retour > 50 % : +40 |
| `HONEYPOT` | champ caché rempli : +80 |
| `FAST_FILL` | formulaire soumis < 4 s après affichage : +30 |
| `NAME_SUSPICIOUS` | < 3 lettres, répétitions, chiffres : +15 |
| `ADDRESS_SUSPICIOUS` | trop court/répétitif (domicile) : +10 |
| `GEO_FOREIGN` | IP hors Algérie (en-tête pays du CDN) : +15 |
| `BOT_UA` | user-agent de robot ou vide : +40 |

## Décision
- Score borné 0–100 ; `ACCEPT` < seuil revue (30) ≤ `REVIEW` < seuil blocage (70) ≤ `BLOCK`.
- `BLOCK` ⇒ commande enregistrée en `BLOCKED` (jamais perdue), page de succès normale par défaut,
  **aucun pixel**, aucune réservation de stock.
- `REVIEW` ⇒ `NEW` + drapeau visible + tri prioritaire dans la file.
- Les signaux et le score sont stockés sur la commande (`fraudSignals`, `fraudScore`) et
  affichés dans la fiche (explicabilité).

## Règles d'implémentation
- Fonction pure `scoreOrder(input, context, settings) → { score, decision, signals[] }` ; le
  contexte (compteurs de vélocité, historique client, listes noires) est chargé par le service
  applicatif.
- Compteurs de vélocité : fenêtres glissantes en base (index adaptés), pas en mémoire.
- Rate limiting HTTP (CDN + API) **en plus** du score, avant même la validation.
- Toute modification de liste noire est auditée.
- Tests : un test par signal, combinaisons, bornes de seuils, règle dure, doublon.
