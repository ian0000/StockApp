import type { PropsWithChildren } from 'react';

import { createInventory } from '@stock-app/domain';

import { AppRuntimeContext } from './app-runtime-context';

const WEB_PREVIEW_INVENTORY = createInventory({
  id: 'web-preview',
  name: 'Mi Negocio',
  currency: 'USD',
  createdAt: 0,
  updatedAt: 0,
});

const WEB_PREVIEW_RUNTIME = Object.freeze({
  adjustmentServices: null,
  backupServices: null,
  inventory: WEB_PREVIEW_INVENTORY,
  historyServices: null,
  persistence: 'web-preview' as const,
  productServices: null,
  purchaseServices: null,
  saleServices: null,
  async rehydrateInventory() {
    return WEB_PREVIEW_INVENTORY;
  },
});

export function AppRuntimeProvider({ children }: PropsWithChildren) {
  return (
    <AppRuntimeContext.Provider value={WEB_PREVIEW_RUNTIME}>
      {children}
    </AppRuntimeContext.Provider>
  );
}
