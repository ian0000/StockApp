import { isBarcodeScannerPlatformSupported } from './barcode-scanner-presentation';

export interface BarcodeOperationResult {
  readonly productId: string;
  readonly requestId: string;
}

export interface BarcodeOperationResultGate {
  tryConsume(requestId: string): boolean;
}

function normalizeRouteParam(
  value: string | readonly string[] | undefined,
): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function normalizeBarcodeOperationResult(
  productIdParam: string | readonly string[] | undefined,
  requestIdParam: string | readonly string[] | undefined,
): BarcodeOperationResult | null {
  const productId = normalizeRouteParam(productIdParam);
  const requestId = normalizeRouteParam(requestIdParam);

  return productId === null || requestId === null
    ? null
    : Object.freeze({ productId, requestId });
}

export function createBarcodeOperationResultGate(): BarcodeOperationResultGate {
  const consumedRequestIds = new Set<string>();

  return Object.freeze({
    tryConsume: (requestId: string) => {
      if (consumedRequestIds.has(requestId)) return false;

      consumedRequestIds.add(requestId);
      return true;
    },
  });
}

export function getBarcodeOperationScannerActionPresentation(platform: string) {
  const enabled = isBarcodeScannerPlatformSupported(platform);

  return Object.freeze({
    label: 'Escanear producto' as const,
    enabled,
    status: enabled ? null : ('Solo móvil' as const),
  });
}
