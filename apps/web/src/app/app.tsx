import { RouterProvider } from 'react-router/dom';
import type { QueryClient } from '@tanstack/react-query';
import type { createBrowserRouter } from 'react-router';
import { Providers } from './providers.js';
import { SessionProvider } from '../auth/context.js';
import type { SessionController } from '../auth/session.js';
import { ProductsContext } from '../products/context.js';
import type { ProductsController } from '../products/controller.js';

export function App({
  router,
  queryClient,
  session,
  products,
}: {
  router: ReturnType<typeof createBrowserRouter>;
  queryClient: QueryClient;
  session: SessionController;
  products?: ProductsController;
}) {
  return (
    <Providers client={queryClient}>
      <SessionProvider controller={session}>
        <ProductsContext.Provider value={products ?? null}>
          <RouterProvider router={router} />
        </ProductsContext.Provider>
      </SessionProvider>
    </Providers>
  );
}
