import type { PropsWithChildren } from 'react';

import { createInventory } from '@stock-app/domain';

import { AppRuntimeContext } from './app-runtime-context';

const WEB_PREVIEW_RUNTIME = Object.freeze({
  inventory: createInventory({
    id: 'web-preview',
    name: 'Mi Negocio',
    currency: 'USD',
    createdAt: 0,
    updatedAt: 0,
  }),
  persistence: 'web-preview' as const,
  productServices: null,
  saleServices: null,
});

export function AppRuntimeProvider({ children }: PropsWithChildren) {
  return (
    <AppRuntimeContext.Provider value={WEB_PREVIEW_RUNTIME}>
      {children}
    </AppRuntimeContext.Provider>
  );
}
