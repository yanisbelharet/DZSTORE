---
name: pixels-capi
description: Pixels Meta et TikTok dans DZ Commerce OS — événements navigateur, Conversions API (Meta) et Events API (TikTok) côté serveur, déclencheur Purchase réglable (soumission, confirmation, expédition, livraison), déduplication par event_id, hachage des données, retries. À charger pour tout code de tracking publicitaire.
---

# Pixels & CAPI

## Règle d'or
Les formats exacts (version de l'API, endpoints, noms de champs, normalisation avant hachage)
**se vérifient dans la documentation officielle Meta / TikTok au moment de l'implémentation** et
sont consignés (avec date et lien) dans `docs/integrations/meta-capi.md` et
`docs/integrations/tiktok-events.md`. Rien n'est écrit de mémoire.

## Événements
| Moment | Navigateur | Serveur |
|---|---|---|
| Vue de page | `PageView` | optionnel |
| Vue produit/landing | `ViewContent` | oui |
| 1re interaction formulaire | `InitiateCheckout` | oui |
| Commande créée (non bloquée) | `Purchase` **si** trigger = `ON_SUBMIT` | `Purchase` si `ON_SUBMIT` |
| Confirmée / expédiée / livrée | — | `Purchase` si trigger correspondant |

- `event_id` déterministe : `<eventName>:<orderId>` pour les événements liés à une commande.
  Pour les vues, identifiant généré **dans le navigateur** (`crypto.randomUUID()`) et transmis au
  serveur avec l'événement funnel — jamais injecté dans le HTML (mis en cache au CDN, il serait
  identique pour tous les visiteurs). Dans tous les cas : **identique** navigateur/serveur.
- Unicité en base : (`pixelConfigId`, `eventName`, `eventId`) ⇒ un événement n'est jamais envoyé
  deux fois, même après retry ou changement de statut aller-retour.
- Pas de `Purchase` pour une commande `BLOCKED`, ni pour une commande annulée avant le trigger.
- Changement du trigger : s'applique aux commandes futures (le trigger est figé sur la commande
  à sa création).

## Données utilisateur
- Capturées à la soumission et stockées sur la commande : IP, user-agent, `_fbp`, `_fbc`
  (construit depuis `fbclid` si absent), `ttclid`, `_ttp`, URL source.
- Hachage SHA-256 après normalisation propre à chaque plateforme (🔶 à vérifier : Meta attend en
  général le téléphone en chiffres avec indicatif sans `+`, TikTok en E.164) : téléphone, prénom,
  nom, ville (commune), pays `dz`, `external_id` (id client).
- IP, user-agent et cookies ne sont **pas** hachés. Rien de tout cela dans les logs.

## Envoi
- Création d'un `TrackingEvent` (PENDING) dans la transaction qui déclenche, via outbox ; job
  d'envoi avec retries/backoff, DLQ, réponse stockée (sans données en clair).
- Contrainte de fraîcheur d'événement côté plateformes (🔶 Meta : `event_time` récent, de l'ordre
  de 7 jours) : `event_time` = moment du déclencheur ; envoi prioritaire.
- Mode test par pixel (`test_event_code`), bouton « envoyer un événement test ».

## Navigateur
- Scripts chargés **après interaction ou au repos** (`requestIdleCallback`/premier scroll) pour
  ne pas pénaliser le LCP ; CSP du store autorisant uniquement les domaines officiels requis.
