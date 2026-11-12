export type Section = '/' | '/users' | '/products' | '/stores' | '/account' | '/system';

/** Menu entry of a path: a store's products belong to « Produits », not « Boutiques ». */
export function sectionOf(pathname: string): Section | undefined {
  if (pathname === '/') return '/';
  if (/^\/(?:products|stores\/[^/]+\/products)(?:\/|$)/u.test(pathname)) return '/products';
  const sections: readonly Section[] = ['/users', '/stores', '/account', '/system'];
  return sections.find((section) => pathname === section || pathname.startsWith(`${section}/`));
}
