import { describe, expect, it } from 'vitest';

import { sectionOf } from './navigation.ts';

describe('menu : rubrique active', () => {
  it.each([
    ['/', '/'],
    ['/users/42', '/users'],
    ['/products', '/products'],
    ['/stores/abc/products', '/products'],
    ['/stores/abc/products/new', '/products'],
    ['/stores', '/stores'],
    ['/stores/abc', '/stores'],
    ['/stores/abc/media', '/stores'],
    ['/system', '/system'],
    ['/forbidden', undefined],
  ])('%s ⇒ %s', (pathname, section) => {
    expect(sectionOf(pathname)).toBe(section);
  });
});
