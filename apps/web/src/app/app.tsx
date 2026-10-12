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
import { ReadsContext } from '../reads/context.js';
import type { ReadsClient } from '../reads/client.js';
import { VoidsContext } from '../voids/context.js';
import type { VoidController } from '../voids/controller.js';
import { AccountContext } from '../account/context.js';
import type { AccountController } from '../account/controller.js';

export function App({
  router,
  queryClient,
  session,
  products,
  sales,
  purchases,
  adjustments,
  reads,
  voids,
  account,
}: {
  router: ReturnType<typeof createBrowserRouter>;
  queryClient: QueryClient;
  session: SessionController;
  products?: ProductsController;
  sales?: SalesController;
  purchases?: PurchasesController;
  adjustments?: AdjustmentsController;
  reads?: ReadsClient;
  voids?: { sale: VoidController; purchase: VoidController };
  account?: AccountController;
}) {
  useEffect(
    () =>
      router.subscribe((state) => {
        const pathname =
          state.navigation.location?.pathname ?? state.location.pathname;
        purchases?.routeChanged(pathname);
        adjustments?.routeChanged(pathname);
        voids?.sale.routeChanged(pathname);
        voids?.purchase.routeChanged(pathname);
        account?.routeChanged(pathname);
      }),
    [router, purchases, adjustments, voids, account],
  );
  return (
    <Providers client={queryClient}>
      <SessionProvider controller={session}>
        <ProductsContext.Provider value={products ?? null}>
          <SalesContext.Provider value={sales ?? null}>
            <SaleDraftProvider session={session} sales={sales ?? null}>
              <PurchasesContext.Provider value={purchases ?? null}>
                <AdjustmentsContext.Provider value={adjustments ?? null}>
                  <ReadsContext.Provider value={reads ?? null}>
                    <VoidsContext.Provider value={voids ?? null}>
                      <AccountContext.Provider value={account ?? null}>
                        <RouterProvider router={router} />
                      </AccountContext.Provider>
                    </VoidsContext.Provider>
                  </ReadsContext.Provider>
                </AdjustmentsContext.Provider>
              </PurchasesContext.Provider>
            </SaleDraftProvider>
          </SalesContext.Provider>
        </ProductsContext.Provider>
      </SessionProvider>
    </Providers>
  );
}
