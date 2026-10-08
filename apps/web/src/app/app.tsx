import { RouterProvider } from 'react-router/dom';
import type { QueryClient } from '@tanstack/react-query';
import type { createBrowserRouter } from 'react-router';
import { Providers } from './providers.js';
import { SessionProvider } from '../auth/context.js';
import type { SessionController } from '../auth/session.js';
import { ProductsContext } from '../products/context.js';
import type { ProductsController } from '../products/controller.js';
import { SalesContext, SaleDraftProvider } from '../sales/context.js';
import type { SalesController } from '../sales/controller.js';

export function App({
  router,
  queryClient,
  session,
  products,
  sales,
}: {
  router: ReturnType<typeof createBrowserRouter>;
  queryClient: QueryClient;
  session: SessionController;
  products?: ProductsController;
  sales?: SalesController;
}) {
  return (
    <Providers client={queryClient}>
      <SessionProvider controller={session}>
        <ProductsContext.Provider value={products ?? null}>
          <SalesContext.Provider value={sales ?? null}>
            <SaleDraftProvider session={session} sales={sales ?? null}>
              <RouterProvider router={router} />
            </SaleDraftProvider>
          </SalesContext.Provider>
        </ProductsContext.Provider>
      </SessionProvider>
    </Providers>
  );
}
