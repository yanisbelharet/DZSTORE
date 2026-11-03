import { themeSchema } from '@dz/contracts';
import { describe, expect, it } from 'vitest';

import { themeCss } from './theme.ts';

describe('thème ⇒ variables CSS', () => {
  it('émet toutes les variables à partir du thème validé', () => {
    const css = themeCss(themeSchema.parse({ colors: { primary: '#AA0000' }, radius: 'lg' }));
    expect(css).toBe(
      ':root{--color-primary:#aa0000;--color-on-primary:#ffffff;--color-background:#ffffff;' +
        '--color-surface:#f8fafc;--color-text:#0f172a;--color-muted:#64748b;--radius:1rem}',
    );
  });

  it('est déterministe (même thème ⇒ même CSS ⇒ même hachage CSP, HTML cacheable)', () => {
    const theme = themeSchema.parse({});
    expect(themeCss(theme)).toBe(themeCss(themeSchema.parse({})));
  });
});
