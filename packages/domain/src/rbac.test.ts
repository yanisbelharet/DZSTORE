import { describe, expect, it } from 'vitest';

import { can, canAssignRoles, canManageUser, PERMISSIONS, permissionsOf, ROLES } from './rbac.ts';

describe('RBAC — matrice des permissions (ARCHITECTURE §6)', () => {
  it('OWNER a toutes les permissions sauf la lecture de ses propres gains d’agent', () => {
    for (const permission of PERMISSIONS) {
      expect(can(['OWNER'], permission)).toBe(permission !== 'earnings.readOwn');
    }
  });

  it('ADMIN a les mêmes permissions qu’OWNER (la gestion des OWNER est réglée à part)', () => {
    expect(permissionsOf(['ADMIN'])).toEqual(permissionsOf(['OWNER']));
  });

  it('agent de confirmation : confirmer, éditer, ajouter à la liste noire ; jamais finance ni paramètres', () => {
    const roles = ['CONFIRMATION_AGENT'] as const;
    for (const allowed of [
      'orders.read',
      'orders.confirm',
      'orders.edit',
      'blacklist.add',
      'earnings.readOwn',
      'stores.read',
    ] as const) {
      expect(can(roles, allowed)).toBe(true);
    }
    for (const denied of [
      'orders.followup',
      'orders.forceStatus',
      'blacklist.remove',
      'finance.read',
      'settings.write',
      'secrets.write',
      'users.manage',
      'users.read',
      'audit.read',
      'shipments.manage',
      'stock.adjust',
      'payouts.manage',
    ] as const) {
      expect(can(roles, denied)).toBe(false);
    }
  });

  it('agent de suivi : suivi des colis, sans confirmation', () => {
    expect(can(['FOLLOWUP_AGENT'], 'orders.followup')).toBe(true);
    expect(can(['FOLLOWUP_AGENT'], 'orders.read')).toBe(true);
    expect(can(['FOLLOWUP_AGENT'], 'orders.confirm')).toBe(false);
    expect(can(['FOLLOWUP_AGENT'], 'blacklist.add')).toBe(false);
  });

  it('agent mixte : union des deux rôles', () => {
    const mixed = ['CONFIRMATION_AGENT', 'FOLLOWUP_AGENT'] as const;
    expect(can(mixed, 'orders.confirm')).toBe(true);
    expect(can(mixed, 'orders.followup')).toBe(true);
    expect(can(mixed, 'finance.read')).toBe(false);
  });

  it('aucun rôle : aucune permission', () => {
    expect(permissionsOf([])).toEqual([]);
  });

  it('gestion des comptes : un ADMIN ne gère ni ne crée d’OWNER ni d’ADMIN', () => {
    expect(canManageUser(['OWNER'], ['ADMIN'])).toBe(true);
    expect(canManageUser(['OWNER'], ['OWNER'])).toBe(true);
    expect(canManageUser(['ADMIN'], ['CONFIRMATION_AGENT'])).toBe(true);
    expect(canManageUser(['ADMIN'], ['ADMIN'])).toBe(false);
    expect(canManageUser(['ADMIN'], ['OWNER'])).toBe(false);
    expect(canManageUser(['CONFIRMATION_AGENT'], ['FOLLOWUP_AGENT'])).toBe(false);
    expect(canAssignRoles(['ADMIN'], ['FOLLOWUP_AGENT', 'CONFIRMATION_AGENT'])).toBe(true);
    expect(canAssignRoles(['ADMIN'], ['ADMIN'])).toBe(false);
    expect(canAssignRoles(['OWNER'], ['ADMIN'])).toBe(true);
  });

  it('liste des rôles stable', () => {
    expect(ROLES).toEqual(['OWNER', 'ADMIN', 'CONFIRMATION_AGENT', 'FOLLOWUP_AGENT']);
  });
});
