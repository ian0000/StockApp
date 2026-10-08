import { RouterProvider } from 'react-router/dom';
import type { QueryClient } from '@tanstack/react-query';
import type { createBrowserRouter } from 'react-router';
import { Providers } from './providers.js';
import { SessionProvider } from '../auth/context.js';
import type { SessionController } from '../auth/session.js';

export function App({
  router,
  queryClient,
  session,
}: {
  router: ReturnType<typeof createBrowserRouter>;
  queryClient: QueryClient;
  session: SessionController;
}) {
  return (
    <Providers client={queryClient}>
      <SessionProvider controller={session}>
        <RouterProvider router={router} />
      </SessionProvider>
    </Providers>
  );
}
