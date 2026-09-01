import type { ProductSummary } from '@stock-app/application';

import { isBarcodeScannerPlatformSupported } from '../barcode/barcode-scanner-presentation';

export interface SaleScanResult {
  readonly productId: string;
  readonly requestId: string;
}

export interface SaleScanResultGate {
  tryConsume(requestId: string): boolean;
}

function normalizeRouteParam(
  value: string | readonly string[] | undefined,
): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function normalizeSaleScanResult(
  productIdParam: string | readonly string[] | undefined,
  requestIdParam: string | readonly string[] | undefined,
): SaleScanResult | null {
  const productId = normalizeRouteParam(productIdParam);
  const requestId = normalizeRouteParam(requestIdParam);

  return productId === null || requestId === null
    ? null
    : Object.freeze({ productId, requestId });
}

export function createSaleScanResultGate(): SaleScanResultGate {
  const consumedRequestIds = new Set<string>();

  return Object.freeze({
    tryConsume: (requestId: string) => {
      if (consumedRequestIds.has(requestId)) return false;

      consumedRequestIds.add(requestId);
      return true;
    },
  });
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
  const enabled = isBarcodeScannerPlatformSupported(platform);

  return Object.freeze({
    label: 'Escanear producto' as const,
    enabled,
    status: enabled ? null : ('Solo móvil' as const),
  });
}
