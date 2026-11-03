import type { Role } from '@dz/domain';

/**
 * Demo data of a local environment — entirely fictitious, documented in the README.
 * Later phases extend it (catalogue, delivery fees, orders) with a seeded random generator.
 */

/** Password of every demo account on a local database (never used elsewhere, see seed.ts). */
export const DEMO_PASSWORD = 'demo-password-2026';

/** Fixed enrolment date of the pre-enrolled demo accounts (determinism). */
export const SEED_EPOCH = new Date('2026-01-01T00:00:00Z');

export interface DemoStore {
  slug: string;
  name: string;
  orderPrefix: string;
  defaultLocale: 'ar' | 'fr';
  locales: ('ar' | 'fr')[];
  theme: { colors: { primary: string }; radius: 'none' | 'sm' | 'md' | 'lg' };
  hostnames: string[];
}

export const DEMO_STORES: readonly DemoStore[] = [
  {
    slug: 'demo-beaute',
    name: 'Beauté Démo',
    orderPrefix: 'BEA',
    defaultLocale: 'ar',
    locales: ['ar', 'fr'],
    theme: { colors: { primary: '#be185d' }, radius: 'lg' },
    hostnames: ['beaute.localhost'],
  },
  {
    slug: 'demo-maison',
    name: 'Maison Démo',
    orderPrefix: 'MAI',
    defaultLocale: 'ar',
    locales: ['ar'],
    theme: { colors: { primary: '#0f766e' }, radius: 'sm' },
    hostnames: ['maison.localhost'],
  },
];

export interface DemoUser {
  email: string;
  name: string;
  roles: Role[];
  locale: 'fr' | 'en';
  /** Store slugs (agents only; OWNER and ADMIN see every store). */
  stores: string[];
  /**
   * Base32 TOTP secret pre-enrolled on a local database (2FA is mandatory for OWNER/ADMIN).
   * Public by design: local demo only.
   */
  totpSecret?: string;
}

export const DEMO_USERS: readonly DemoUser[] = [
  {
    email: 'owner@demo.test',
    name: 'Propriétaire Démo',
    roles: ['OWNER'],
    locale: 'fr',
    stores: [],
    totpSecret: 'OWNERDEMOTOTPSECRETDZCOMMERCEOS2',
  },
  {
    email: 'admin@demo.test',
    name: 'Admin Démo',
    roles: ['ADMIN'],
    locale: 'fr',
    stores: [],
    totpSecret: 'ADMINDEMOTOTPSECRETDZCOMMERCEOS3',
  },
  {
    email: 'confirmation1@demo.test',
    name: 'Agent Confirmation 1',
    roles: ['CONFIRMATION_AGENT'],
    locale: 'fr',
    stores: ['demo-beaute', 'demo-maison'],
  },
  {
    email: 'confirmation2@demo.test',
    name: 'Agent Confirmation 2',
    roles: ['CONFIRMATION_AGENT'],
    locale: 'en',
    stores: ['demo-beaute'],
  },
  {
    email: 'suivi@demo.test',
    name: 'Agent Suivi',
    roles: ['FOLLOWUP_AGENT'],
    locale: 'fr',
    stores: ['demo-maison'],
  },
  {
    email: 'mixte@demo.test',
    name: 'Agent Mixte',
    roles: ['CONFIRMATION_AGENT', 'FOLLOWUP_AGENT'],
    locale: 'fr',
    stores: ['demo-beaute'],
  },
];
