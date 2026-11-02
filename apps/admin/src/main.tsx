import './styles.css';
import './i18n/index.ts';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';

import { ApiError } from './lib/api.ts';
import { createAppRouter } from './router.tsx';

const onUnauthenticated = (error: unknown) => {
  // Session expired or revoked: back to the login page.
  if (error instanceof ApiError && error.status === 401 && window.location.pathname !== '/login') {
    void router.navigate({ to: '/login' });
  }
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onUnauthenticated }),
  mutationCache: new MutationCache({ onError: onUnauthenticated }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});
const router = createAppRouter(queryClient);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="bottom-right" />
    </QueryClientProvider>
  </StrictMode>,
);
