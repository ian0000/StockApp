export type CameraPermissionContentKind =
  'checking' | 'required' | 'ready' | 'denied-requestable' | 'denied-settings';

export interface CameraPermissionState {
  readonly status: 'undetermined' | 'granted' | 'denied';
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}

export interface BarcodeScanGate {
  isArmed(): boolean;
  rearm(): void;
  tryAccept(data: string): string | null;
}

export interface BarcodeResultPresentation {
  readonly message: string;
  readonly supportingText: string;
  readonly barcode: string | null;
}

export type BarcodeScannerOrigin =
  | { readonly kind: 'products' }
  | { readonly kind: 'sale'; readonly requestId: string };

export interface BarcodeNotFoundPresentation extends BarcodeResultPresentation {
  readonly actions: {
    readonly createProduct: 'Crear producto' | null;
    readonly rescan: 'Escanear de nuevo';
    readonly back: 'Volver' | 'Volver a venta';
  };
}

export const BARCODE_SCANNER_ROUTE = '/barcode/scan' as const;

export const COMMERCIAL_BARCODE_TYPES = Object.freeze([
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
] as const);

export function isBarcodeScannerPlatformSupported(platform: string): boolean {
  return platform === 'ios' || platform === 'android';
}

export function createBarcodeNotFoundPresentation(
  barcode: string,
  origin: BarcodeScannerOrigin = { kind: 'products' },
): BarcodeNotFoundPresentation {
  return Object.freeze({
    message: 'Producto no encontrado',
    supportingText:
      'No existe un producto activo con este código en tu inventario.',
    barcode,
    actions: Object.freeze({
      createProduct:
        origin.kind === 'products' ? ('Crear producto' as const) : null,
      rescan: 'Escanear de nuevo',
      back: origin.kind === 'sale' ? ('Volver a venta' as const) : 'Volver',
    }),
  });
}

function normalizeRouteParam(
  value: string | readonly string[] | undefined,
): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function parseBarcodeScannerOrigin(
  originParam: string | readonly string[] | undefined,
  requestIdParam: string | readonly string[] | undefined,
): BarcodeScannerOrigin {
  const requestId = normalizeRouteParam(requestIdParam);

  return originParam === 'sale' && requestId !== null
    ? Object.freeze({ kind: 'sale', requestId })
    : Object.freeze({ kind: 'products' });
}

export function createSaleBarcodeScannerRoute(requestId: string) {
  return Object.freeze({
    pathname: BARCODE_SCANNER_ROUTE,
    params: Object.freeze({ origin: 'sale' as const, requestId }),
  });
}

export function createSaleBarcodeResultRoute(
  productId: string,
  requestId: string,
) {
  return Object.freeze({
    pathname: '/sale' as const,
    params: Object.freeze({
      scannedProductId: productId,
      scanRequestId: requestId,
    }),
  });
}

export function getBarcodeScannerBackLabel(
  origin: BarcodeScannerOrigin,
): 'Volver' | 'Volver a venta' {
  return origin.kind === 'sale' ? 'Volver a venta' : 'Volver';
}

export function createProductNewRouteFromBarcode(barcode: string) {
  return Object.freeze({
    pathname: '/product/new' as const,
    params: Object.freeze({ barcode: normalizeScannedBarcode(barcode) ?? '' }),
  });
}

export function createBarcodeScannerFailurePresentation(
  kind: 'camera' | 'lookup',
): BarcodeResultPresentation {
  return kind === 'camera'
    ? Object.freeze({
        message: 'No pudimos iniciar la cámara',
        supportingText:
          'Cierra otras aplicaciones que estén usando la cámara e inténtalo nuevamente.',
        barcode: null,
      })
    : Object.freeze({
        message: 'No pudimos buscar el producto',
        supportingText:
          'La lectura fue correcta, pero falló la consulta local. Tus datos no fueron modificados.',
        barcode: null,
      });
}

export function normalizeScannedBarcode(data: string): string | null {
  const normalized = data.trim();
  return normalized.length === 0 ? null : normalized;
}

export function createBarcodeScanGate(): BarcodeScanGate {
  let armed = true;

  return Object.freeze({
    isArmed: () => armed,
    rearm: () => {
      armed = true;
    },
    tryAccept: (data: string) => {
      if (!armed) return null;

      const barcode = normalizeScannedBarcode(data);
      if (barcode === null) return null;

      armed = false;
      return barcode;
    },
  });
}

export function getCameraPermissionContentKind(
  permission: CameraPermissionState | null,
): CameraPermissionContentKind {
  if (permission === null) return 'checking';
  if (permission.granted) return 'ready';
  if (permission.status === 'undetermined') return 'required';
  return permission.canAskAgain ? 'denied-requestable' : 'denied-settings';
}
