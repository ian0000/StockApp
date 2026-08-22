import { createContext, useContext } from 'react';

import type {
  CreateProductUseCase,
  GetSalesSummaryUseCase,
  ListProductsUseCase,
  RegisterSaleUseCase,
} from '@stock-app/application';
import type { Inventory } from '@stock-app/domain';

export interface ProductRuntimeServices {
  readonly createProduct: CreateProductUseCase;
  readonly listProducts: ListProductsUseCase;
}

export interface SaleRuntimeServices {
  readonly getSalesSummary: GetSalesSummaryUseCase;
  readonly registerSale: RegisterSaleUseCase;
}

export interface AppRuntimeContextValue {
  readonly inventory: Inventory;
  readonly persistence: 'sqlite' | 'web-preview';
  readonly productServices: ProductRuntimeServices | null;
  readonly saleServices: SaleRuntimeServices | null;
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
