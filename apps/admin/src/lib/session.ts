import { queryOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { api, ApiError } from './api.ts';

export type Role = 'OWNER' | 'ADMIN' | 'CONFIRMATION_AGENT' | 'FOLLOWUP_AGENT';
export const ROLES: readonly Role[] = ['OWNER', 'ADMIN', 'CONFIRMATION_AGENT', 'FOLLOWUP_AGENT'];

export interface Me {
  user: { id: string; email: string; name: string; roles: Role[]; locale: string };
  twoFactor: 'verified' | 'not_required' | 'verification_required' | 'enrolment_required';
  totpEnabled: boolean;
  /** Granted by the API; the UI only hides what the API would refuse anyway. */
  permissions: string[];
  storeIds: 'all' | string[];
}

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => api<Me>('/v1/auth/me'),
  staleTime: 60_000,
  retry: false,
});

/** Current session, or null when signed out. */
export async function loadMe(queryClient: QueryClient): Promise<Me | null> {
  try {
    return await queryClient.query(meQuery);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function can(me: Me, permission: string): boolean {
  return me.permissions.includes(permission);
}

export async function signOut(queryClient: QueryClient): Promise<void> {
  await api('/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
  queryClient.clear();
}
