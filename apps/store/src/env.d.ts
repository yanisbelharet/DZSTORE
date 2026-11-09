/// <reference types="astro/client" />

import type { PublicStore, StoreLocale } from '@dz/contracts';

declare global {
  namespace App {
    /** Set by the middleware for every storefront page (absent only on /health). */
    interface Locals {
      store?: PublicStore;
      locale?: StoreLocale;
      /** Page path without the language prefix. */
      path?: string;
      /** Canonical origin (`https://` + primary domain, or the requested host). */
      origin?: string;
      /** Free test deployment: banner and no indexing. */
      testEnvironment?: boolean;
    }
  }
}

export {};
