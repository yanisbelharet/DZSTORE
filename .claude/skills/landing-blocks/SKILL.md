---
name: landing-blocks
description: Landing page builder de DZ Commerce OS — contrat des blocs (schéma Zod versionné, props localisées ar/fr), rendu Astro sans JS, îlots interactifs, éditeur admin et aperçu, publication versionnée, règles de contenu (pas de faux avis ni de fausse urgence). À charger pour tout code de bloc, d'éditeur, de rendu de page ou de génération IA de landing.
---

# Blocs de landing

## Contrat (package `blocks`)
```ts
type Block = { id: string; type: BlockType; version: number; props: unknown; hidden?: boolean };
// Par type : schema (Zod, props localisées { ar?: string; fr?: string }), defaults,
// migrate(fromVersion, props) → props courantes, editorFields (description du formulaire admin).
```
- Une page = `{ schemaVersion, blocks: Block[], seo, settings }`, validée par Zod à l'écriture
  **et** à la lecture (migration à la volée des versions anciennes).
- Les images référencent des `Media` (id), jamais d'URL arbitraire ; vidéos : URL d'hébergeurs
  autorisés.

## Rendu (store)
- Un composant `.astro` par type, **zéro JS** sauf blocs interactifs (formulaire COD, galerie,
  offres, CTA collant) en îlots Preact hydratés `client:visible` (ou `client:idle`).
- Premier bloc visuel : image LCP avec `fetchpriority="high"`, dimensions explicites, pas de
  lazy ; les suivants en `loading="lazy"`.
- RTL : propriétés CSS logiques uniquement ; icônes directionnelles inversées en `dir="rtl"`.
- Bloc inconnu ou invalide : ignoré au rendu + erreur journalisée (jamais de page cassée).

## Éditeur (admin)
- Liste ordonnable (clavier + glisser), panneau de propriétés généré depuis `editorFields`,
  aperçu = iframe vers la route brouillon du store (jeton signé à durée courte), bascule
  mobile/desktop et ar/fr, autosave du brouillon.
- Publication = nouvelle `PageVersion` immuable + purge CDN ; retour à une version antérieure
  possible.

## Contenu interdit
- Témoignages : uniquement réels, avec source/consentement (champ obligatoire), jamais générés
  par l'IA comme s'ils étaient réels.
- Compte à rebours : uniquement lié à une date de fin d'offre réelle. Pas de faux stock restant,
  faux visiteurs en ligne, fausses notifications d'achat.
- L'IA produit des **brouillons** ; publication par un humain.
