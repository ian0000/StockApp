import { createContext, useContext } from 'react';

import type {
  AdjustStockUseCase,
  ArchiveProductUseCase,
  CreateProductUseCase,
  GetProductDetailsUseCase,
  GetPurchaseDetailsUseCase,
  GetSaleDetailsUseCase,
  GetSalesSummaryUseCase,
  ListHistoryUseCase,
  ListProductsUseCase,
  RegisterPurchaseUseCase,
  RegisterSaleUseCase,
  UpdateProductUseCase,
  VoidPurchaseUseCase,
  VoidSaleUseCase,
} from '@stock-app/application';
import type { Inventory } from '@stock-app/domain';

export interface ProductRuntimeServices {
  readonly archiveProduct: ArchiveProductUseCase;
  readonly createProduct: CreateProductUseCase;
  readonly getProductDetails: GetProductDetailsUseCase;
  readonly listProducts: ListProductsUseCase;
  readonly updateProduct: UpdateProductUseCase;
}

export interface SaleRuntimeServices {
  readonly getSaleDetails: GetSaleDetailsUseCase;
  readonly getSalesSummary: GetSalesSummaryUseCase;
  readonly registerSale: RegisterSaleUseCase;
  readonly voidSale: VoidSaleUseCase;
}

export interface PurchaseRuntimeServices {
  readonly getPurchaseDetails: GetPurchaseDetailsUseCase;
  readonly registerPurchase: RegisterPurchaseUseCase;
  readonly voidPurchase: VoidPurchaseUseCase;
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
