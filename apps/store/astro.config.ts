import node from '@astrojs/node';
import preact from '@astrojs/preact';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

/**
 * Same code everywhere, adapter chosen at build time (ADR-0013, ADR-0020):
 * Node (standalone server) by default — VPS production, local, e2e — and Vercel for the
 * free test environment.
 */
function selectAdapter() {
  const target = process.env.STORE_ADAPTER ?? 'node';
  if (target === 'node') return node({ mode: 'standalone' });
  if (target === 'vercel') return vercel();
  throw new Error(`STORE_ADAPTER must be "node" or "vercel" (got "${target}")`);
}

export default defineConfig({
  output: 'server',
  adapter: selectAdapter(),
  integrations: [preact()],
  // Pages are server-rendered per host; nothing is prerendered at build time.
  trailingSlash: 'ignore',
  compressHTML: true,
  prefetch: false,
  devToolbar: { enabled: false },
  // No Markdown code blocks: Shiki's inline styles would break the CSP.
  markdown: { syntaxHighlight: false },
  build: { inlineStylesheets: 'auto' },
  security: {
    checkOrigin: true,
    // Hash-based CSP in a <meta> element: compatible with CDN-cached HTML (a nonce would be
    // shared by every visitor). Directives that a <meta> cannot carry (frame-ancestors) are
    // sent as a header by the middleware.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "object-src 'none'",
      ],
    },
  },
});
