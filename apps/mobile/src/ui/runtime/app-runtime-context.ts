import { createContext, useContext } from 'react';

import type {
  AdjustStockUseCase,
  CreateProductUseCase,
  GetSalesSummaryUseCase,
  ListHistoryUseCase,
  ListProductsUseCase,
  RegisterPurchaseUseCase,
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

export interface PurchaseRuntimeServices {
  readonly registerPurchase: RegisterPurchaseUseCase;
}

export interface AdjustmentRuntimeServices {
  readonly adjustStock: AdjustStockUseCase;
}

export interface HistoryRuntimeServices {
  readonly listHistory: ListHistoryUseCase;
}

export interface AppRuntimeContextValue {
  readonly adjustmentServices: AdjustmentRuntimeServices | null;
  readonly inventory: Inventory;
  readonly historyServices: HistoryRuntimeServices | null;
  readonly persistence: 'sqlite' | 'web-preview';
  readonly productServices: ProductRuntimeServices | null;
  readonly purchaseServices: PurchaseRuntimeServices | null;
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
