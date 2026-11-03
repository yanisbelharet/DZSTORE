import type { Theme } from '@dz/contracts';

const RADIUS: Record<Theme['radius'], string> = {
  none: '0',
  sm: '0.25rem',
  md: '0.5rem',
  lg: '1rem',
};

/**
 * Store theme as CSS custom properties. Values come from a validated schema (hex colours,
 * enumerated radius), so the output cannot carry injected CSS.
 */
export function themeCss(theme: Theme): string {
  const { colors } = theme;
  return (
    ':root{' +
    `--color-primary:${colors.primary};` +
    `--color-on-primary:${colors.onPrimary};` +
    `--color-background:${colors.background};` +
    `--color-surface:${colors.surface};` +
    `--color-text:${colors.text};` +
    `--color-muted:${colors.muted};` +
    `--radius:${RADIUS[theme.radius]}` +
    '}'
  );
}
