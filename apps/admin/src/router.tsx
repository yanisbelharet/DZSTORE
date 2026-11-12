import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';

import { AppShell } from './components/app-shell.tsx';
import { EnvironmentBanner } from './components/environment-banner.tsx';
import { ErrorView, ForbiddenView, NotFoundView } from './components/states.tsx';
import { can, loadMe } from './lib/session.ts';
import type { Me } from './lib/session.ts';
import { HomePage } from './pages/home.tsx';

// Pages are loaded on demand (code splitting): the first screen stays light.
const authPage = (name: 'LoginPage' | 'TwoFactorSetupPage' | 'TwoFactorVerifyPage') =>
  lazyRouteComponent(() => import('./pages/auth.tsx'), name);
const usersPage = (name: 'UsersPage' | 'UserFormPage') =>
  lazyRouteComponent(() => import('./pages/users.tsx'), name);
const AccountPage = lazyRouteComponent(() => import('./pages/account.tsx'), 'AccountPage');
const storesPage = (name: 'StoresPage' | 'StoreSettingsPage') =>
  lazyRouteComponent(() => import('./pages/stores.tsx'), name);
const MediaPage = lazyRouteComponent(() => import('./pages/media.tsx'), 'MediaPage');
const SystemPage = lazyRouteComponent(() => import('./pages/system.tsx'), 'SystemPage');

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <EnvironmentBanner />
      <Outlet />
    </>
  ),
  notFoundComponent: NotFoundView,
  errorComponent: ({ error, reset }) => (
    <div className="p-8">
      <ErrorView error={error} onRetry={reset} />
    </div>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: authPage('LoginPage'),
});

/** Pages reachable while the second factor is pending (but with a session). */
async function requireSession(queryClient: QueryClient): Promise<Me> {
  const me = await loadMe(queryClient);
  if (!me) throw redirect({ to: '/login' });
  return me;
}

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/2fa/setup',
  beforeLoad: ({ context }) => requireSession(context.queryClient),
  component: authPage('TwoFactorSetupPage'),
});
const verifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/2fa/verify',
  beforeLoad: ({ context }) => requireSession(context.queryClient),
  component: authPage('TwoFactorVerifyPage'),
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: async ({ context }) => {
    const me = await requireSession(context.queryClient);
    if (me.twoFactor === 'enrolment_required') throw redirect({ to: '/2fa/setup' });
    if (me.twoFactor === 'verification_required') throw redirect({ to: '/2fa/verify' });
    return { me };
  },
  component: AppShell,
});

/** UI guard only: the API enforces every permission anyway. */
const requirePermission =
  (permission: string) =>
  ({ context }: { context: { me: Me } }) => {
    if (!can(context.me, permission)) throw redirect({ to: '/forbidden' });
  };

const homeRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: HomePage });
const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users',
  beforeLoad: requirePermission('users.read'),
  component: usersPage('UsersPage'),
});
const userNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users/new',
  beforeLoad: requirePermission('users.manage'),
  component: usersPage('UserFormPage'),
});
const userEditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users/$userId',
  beforeLoad: requirePermission('users.read'),
  component: usersPage('UserFormPage'),
});
const storesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/stores',
  beforeLoad: requirePermission('stores.read'),
  component: storesPage('StoresPage'),
});
const storeSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/stores/$storeId',
  beforeLoad: requirePermission('stores.read'),
  component: storesPage('StoreSettingsPage'),
});
const storeMediaRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/stores/$storeId/media',
  beforeLoad: requirePermission('catalog.read'),
  component: MediaPage,
});
const accountRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/account',
  component: AccountPage,
});
const systemRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/system',
  beforeLoad: requirePermission('jobs.manage'),
  component: SystemPage,
});
const forbiddenRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/forbidden',
  component: ForbiddenView,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  verifyRoute,
  appRoute.addChildren([
    homeRoute,
    usersRoute,
    userNewRoute,
    userEditRoute,
    storesRoute,
    storeSettingsRoute,
    storeMediaRoute,
    accountRoute,
    systemRoute,
    forbiddenRoute,
  ]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent' });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
