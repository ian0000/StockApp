import { createContext, useContext } from 'react';

import type {
  CreateProductUseCase,
  ListProductsUseCase,
} from '@stock-app/application';
import type { Inventory } from '@stock-app/domain';

export interface ProductRuntimeServices {
  readonly createProduct: CreateProductUseCase;
  readonly listProducts: ListProductsUseCase;
}

export interface AppRuntimeContextValue {
  readonly inventory: Inventory;
  readonly persistence: 'sqlite' | 'web-preview';
  readonly productServices: ProductRuntimeServices | null;
}

export const AppRuntimeContext = createContext<AppRuntimeContextValue | null>(
  null,
);

export function useAppRuntime(): AppRuntimeContextValue {
  const runtime = useContext(AppRuntimeContext);

  if (runtime === null) {
    throw new Error('App runtime is not ready.');
  }

  return runtime;
}
