import type { ar } from './ar.ts';

/** French. Same keys as Arabic (enforced by the type). */
export const fr = {
  'meta.description': 'Boutique {store} — paiement à la livraison.',
  'nav.home': 'Accueil',
  'nav.language': 'Langue',
  'home.title': 'Bienvenue chez {store}',
  'home.soon': 'Nos produits seront bientôt disponibles ici.',
  'footer.cod': 'Paiement à la livraison',
  'footer.rights': '© {year} {store} — tous droits réservés',
  'notFound.title': 'Page introuvable',
  'notFound.body': 'Le lien suivi est incorrect ou la page n’est plus disponible.',
  'notFound.back': 'Retour à l’accueil',
  'unknownStore.title': 'Cette boutique n’existe pas',
  'unavailable.title': 'Boutique momentanément indisponible',
  'unavailable.body': 'Merci de réessayer dans quelques instants.',
} as const satisfies Record<keyof typeof ar, string>;
