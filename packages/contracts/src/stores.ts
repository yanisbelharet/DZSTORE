import { z } from 'zod';

/** Languages a storefront can be served in (Arabic is RTL and the default). */
export const STORE_LOCALES = ['ar', 'fr'] as const;
export type StoreLocale = (typeof STORE_LOCALES)[number];
export const storeLocaleSchema = z.enum(STORE_LOCALES);

// `.toLowerCase()` is an overwrite (not a transform): the schema also serialises API responses.
const hexColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/iu, { error: 'expected a #rrggbb colour' })
  .toLowerCase();

/**
 * Store theme (`Store.theme` JSON). Every field has a default: `{}` is a valid theme.
 * Colours are plain hex values; they are emitted as CSS custom properties by the storefront.
 */
export const themeSchema = z.object({
  colors: z
    .object({
      primary: hexColor.default('#0f766e'),
      onPrimary: hexColor.default('#ffffff'),
      background: hexColor.default('#ffffff'),
      surface: hexColor.default('#f8fafc'),
      text: hexColor.default('#0f172a'),
      muted: hexColor.default('#64748b'),
    })
    .prefault({}),
  radius: z.enum(['none', 'sm', 'md', 'lg']).default('md'),
});
export type Theme = z.infer<typeof themeSchema>;
export type ThemeInput = z.input<typeof themeSchema>;

/**
 * Hostname as stored in `StoreDomain.hostname`: lower case, no port, no trailing dot.
 * Returns `undefined` when the value cannot be a hostname.
 */
export function normalizeHostname(raw: string): string | undefined {
  let host = raw.trim().toLowerCase();
  // Strip a port, keeping bracketed IPv6 literals intact.
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    if (end === -1) return undefined;
    host = host.slice(0, end + 1);
  } else {
    const colon = host.indexOf(':');
    if (colon !== -1) host = host.slice(0, colon);
  }
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host.length === 0 || host.length > 253) return undefined;
  if (host.startsWith('[')) return host;
  const labels = host.split('.');
  const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
  return labels.every((part) => label.test(part)) ? host : undefined;
}

/** Public, cacheable description of a store (no secret, no internal setting). */
export const publicStoreSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  defaultLocale: storeLocaleSchema,
  locales: z.array(storeLocaleSchema).min(1),
  /** Canonical hostname (primary domain), used for canonical URLs. */
  primaryHost: z.string().nullable(),
  theme: themeSchema,
});
export type PublicStore = z.infer<typeof publicStoreSchema>;

export const resolveStoreQuerySchema = z.object({
  host: z.string().min(1).max(260),
});

export const resolveStoreResponseSchema = z.object({ store: publicStoreSchema });
export type ResolveStoreResponse = z.infer<typeof resolveStoreResponseSchema>;

/** Header carrying the storefront's service token on `/v1/public/*` calls. */
export const SERVICE_TOKEN_HEADER = 'x-dz-service-token';
