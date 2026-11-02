/**
 * Role-based access control (ADR-0008, ARCHITECTURE §6). Pure: no I/O.
 * Every API route declares the permission it requires; scope (stores, own records) is checked
 * on top of it by the application layer.
 */
export const ROLES = ['OWNER', 'ADMIN', 'CONFIRMATION_AGENT', 'FOLLOWUP_AGENT'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  // platform
  'users.read',
  'users.manage',
  'stores.read',
  'stores.manage',
  'audit.read',
  'jobs.manage',
  'settings.write',
  'secrets.write',
  // orders
  'orders.read',
  'orders.confirm',
  'orders.edit',
  'orders.followup',
  'orders.forceStatus',
  'shipments.manage',
  'blacklist.add',
  'blacklist.remove',
  // catalogue & content
  'catalog.read',
  'catalog.write',
  'pages.publish',
  // money & stock
  'finance.read',
  'stock.adjust',
  'payouts.manage',
  'earnings.readOwn',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MANAGER_PERMISSIONS = PERMISSIONS.filter((permission) => permission !== 'earnings.readOwn');

const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  OWNER: new Set(MANAGER_PERMISSIONS),
  ADMIN: new Set(MANAGER_PERMISSIONS),
  CONFIRMATION_AGENT: new Set<Permission>([
    'stores.read',
    'orders.read',
    'orders.confirm',
    'orders.edit',
    'blacklist.add',
    'catalog.read',
    'earnings.readOwn',
  ]),
  FOLLOWUP_AGENT: new Set<Permission>([
    'stores.read',
    'orders.read',
    'orders.followup',
    'catalog.read',
    'earnings.readOwn',
  ]),
};

export function can(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].has(permission));
}

/** Sorted, de-duplicated permissions granted by a set of roles. */
export function permissionsOf(roles: readonly Role[]): Permission[] {
  return PERMISSIONS.filter((permission) => can(roles, permission));
}

const PRIVILEGED: readonly Role[] = ['OWNER', 'ADMIN'];
const isPrivileged = (roles: readonly Role[]) => roles.some((role) => PRIVILEGED.includes(role));

/** OWNER manages everyone; ADMIN manages agents only; agents manage nobody. */
export function canManageUser(actorRoles: readonly Role[], targetRoles: readonly Role[]): boolean {
  if (actorRoles.includes('OWNER')) return true;
  if (actorRoles.includes('ADMIN')) return !isPrivileged(targetRoles);
  return false;
}

/** Only OWNER grants OWNER or ADMIN; ADMIN grants agent roles. */
export function canAssignRoles(actorRoles: readonly Role[], roles: readonly Role[]): boolean {
  return canManageUser(actorRoles, roles);
}
