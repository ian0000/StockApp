import type { ProductSummary } from '@stock-app/application';

import {
  createBarcodeOperationResultGate,
  getBarcodeOperationScannerActionPresentation,
  normalizeBarcodeOperationResult,
  type BarcodeOperationResult,
  type BarcodeOperationResultGate,
} from '../barcode/barcode-operation-result';

export type SaleScanResult = BarcodeOperationResult;
export type SaleScanResultGate = BarcodeOperationResultGate;

export function normalizeSaleScanResult(
  productIdParam: string | readonly string[] | undefined,
  requestIdParam: string | readonly string[] | undefined,
): SaleScanResult | null {
  return normalizeBarcodeOperationResult(productIdParam, requestIdParam);
}

export function createSaleScanResultGate(): SaleScanResultGate {
  return createBarcodeOperationResultGate();
}

export function resolveSaleScanProduct(
  products: readonly ProductSummary[],
  result: SaleScanResult,
): ProductSummary | null {
  return (
    products.find(({ product }) => product.id === result.productId) ?? null
  );
}

export function getSaleScannerActionPresentation(platform: string) {
  return getBarcodeOperationScannerActionPresentation(platform);
}
