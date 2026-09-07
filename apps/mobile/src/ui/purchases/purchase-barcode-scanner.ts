import type { ProductSummary } from '@stock-app/application';

import {
  createBarcodeOperationResultGate,
  getBarcodeOperationScannerActionPresentation,
  normalizeBarcodeOperationResult,
  type BarcodeOperationResult,
  type BarcodeOperationResultGate,
} from '../barcode/barcode-operation-result';

export type PurchaseScanResult = BarcodeOperationResult;
export type PurchaseScanResultGate = BarcodeOperationResultGate;

export interface PurchaseProductSelectionState {
  readonly selectedProduct: ProductSummary | null;
  readonly searchText: string;
  readonly quantityText: string;
  readonly unitCostText: string;
  readonly submitError: string | null;
}

export function normalizePurchaseScanResult(
  productIdParam: string | readonly string[] | undefined,
  requestIdParam: string | readonly string[] | undefined,
): PurchaseScanResult | null {
  return normalizeBarcodeOperationResult(productIdParam, requestIdParam);
}

export function createPurchaseScanResultGate(): PurchaseScanResultGate {
  return createBarcodeOperationResultGate();
}

export function resolvePurchaseScanProduct(
  products: readonly ProductSummary[],
  result: PurchaseScanResult,
): ProductSummary | null {
  return (
    products.find(({ product }) => product.id === result.productId) ?? null
  );
}

export function getPurchaseScannerActionPresentation(platform: string) {
  return getBarcodeOperationScannerActionPresentation(platform);
}

export function applyPurchaseProductSelection(
  _current: PurchaseProductSelectionState,
  selectedProduct: ProductSummary,
): PurchaseProductSelectionState {
  return Object.freeze({
    selectedProduct,
    searchText: '',
    quantityText: '',
    unitCostText: '',
    submitError: null,
  });
}
