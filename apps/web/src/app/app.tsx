import { RouterProvider } from 'react-router/dom';
import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { createBrowserRouter } from 'react-router';
import { Providers } from './providers.js';
import { SessionProvider } from '../auth/context.js';
import type { SessionController } from '../auth/session.js';
import { ProductsContext } from '../products/context.js';
import type { ProductsController } from '../products/controller.js';
import { SalesContext, SaleDraftProvider } from '../sales/context.js';
import type { SalesController } from '../sales/controller.js';
import { PurchasesContext } from '../purchases/context.js';
import type { PurchasesController } from '../purchases/controller.js';
import { AdjustmentsContext } from '../adjustments/context.js';
import type { AdjustmentsController } from '../adjustments/controller.js';

export function App({
  router,
  queryClient,
  session,
  products,
  sales,
  purchases,
  adjustments,
}: {
  router: ReturnType<typeof createBrowserRouter>;
  queryClient: QueryClient;
  session: SessionController;
  products?: ProductsController;
  sales?: SalesController;
  purchases?: PurchasesController;
  adjustments?: AdjustmentsController;
}) {
  useEffect(
    () =>
      router.subscribe((state) => {
        const pathname =
          state.navigation.location?.pathname ?? state.location.pathname;
        purchases?.routeChanged(pathname);
        adjustments?.routeChanged(pathname);
      }),
    [router, purchases, adjustments],
  );
  return (
    <Providers client={queryClient}>
      <SessionProvider controller={session}>
        <ProductsContext.Provider value={products ?? null}>
          <SalesContext.Provider value={sales ?? null}>
            <SaleDraftProvider session={session} sales={sales ?? null}>
              <PurchasesContext.Provider value={purchases ?? null}>
                <AdjustmentsContext.Provider value={adjustments ?? null}>
                  <RouterProvider router={router} />
                </AdjustmentsContext.Provider>
              </PurchasesContext.Provider>
            </SaleDraftProvider>
          </SalesContext.Provider>
        </ProductsContext.Provider>
      </SessionProvider>
    </Providers>
  );
}
