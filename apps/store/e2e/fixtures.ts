/** Demo stores of the storefront e2e tests (fictitious data). */
export const STORE_A = {
  host: 'boutique-a.localhost',
  slug: 'alpha',
  name: 'Boutique Alpha',
  primary: '#b91c1c',
} as const;

export const STORE_B = {
  host: 'boutique-b.localhost',
  slug: 'beta',
  name: 'Maison Beta',
  primary: '#1d4ed8',
} as const;

export const INACTIVE_HOST = 'fermee.localhost';
export const UNKNOWN_HOST = 'inconnue.localhost';
