import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '@/ui/components/Screen';
import {
  createBarcodeScanGate,
  createBarcodeNotFoundPresentation,
  createBarcodeScannerFailurePresentation,
  createProductNewRouteFromBarcode,
  COMMERCIAL_BARCODE_TYPES,
  getCameraPermissionContentKind,
  isBarcodeScannerPlatformSupported,
} from '@/ui/barcode/barcode-scanner-presentation';
import { createProductDetailsRoute } from '@/ui/products/product-details-presentation';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

type ScannerState =
  | { readonly status: 'ready' }
  | { readonly status: 'resolving'; readonly barcode: string }
  | { readonly status: 'not-found'; readonly barcode: string }
  | { readonly status: 'lookup-error'; readonly barcode: string }
  | { readonly status: 'camera-error' };

export default function BarcodeScannerScreen() {
  const router = useRouter();

  if (!isBarcodeScannerPlatformSupported(Platform.OS)) {
    return (
      <Screen edges={['bottom']}>
        <StatusContent
          message="Escaneo no disponible en Web"
          supportingText="El escaneo de códigos está disponible en la app móvil para iOS y Android."
        >
          <SecondaryAction label="Volver" onPress={() => router.back()} />
        </StatusContent>
      </Screen>
    );
  }

  return <NativeBarcodeScanner />;
}

function NativeBarcodeScanner() {
  const router = useRouter();
  const { inventory, productServices } = useAppRuntime();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const scanGateRef = useRef(createBarcodeScanGate());
  const lookupRequestRef = useRef(0);
  const [cameraKey, setCameraKey] = useState(0);
  const [permissionError, setPermissionError] = useState(false);
  const [state, setState] = useState<ScannerState>({ status: 'ready' });
  const permissionKind = getCameraPermissionContentKind(permission);

  useEffect(
    () => () => {
      lookupRequestRef.current += 1;
    },
    [],
  );

  async function resolveBarcode(barcode: string) {
    const requestId = lookupRequestRef.current + 1;
    lookupRequestRef.current = requestId;
    setState({ status: 'resolving', barcode });

    try {
      if (productServices === null) {
        throw new Error('Product services are unavailable.');
      }

      const match = await productServices.findProductByBarcode.execute({
        inventoryId: inventory.id,
        barcode,
      });

      if (lookupRequestRef.current !== requestId) return;

      if (match === null) {
        setState({ status: 'not-found', barcode });
        return;
      }

      router.replace(createProductDetailsRoute(match.productId));
    } catch {
      if (lookupRequestRef.current === requestId) {
        setState({ status: 'lookup-error', barcode });
      }
    }
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    const barcode = scanGateRef.current.tryAccept(result.data);
    if (barcode !== null) void resolveBarcode(barcode);
  }

  function rearmScanner() {
    lookupRequestRef.current += 1;
    scanGateRef.current.rearm();
    setState({ status: 'ready' });
  }

  async function handlePermissionRequest() {
    setPermissionError(false);

    try {
      await requestPermission();
    } catch {
      setPermissionError(true);
    }
  }

  async function handleOpenSettings() {
    setPermissionError(false);

    try {
      await Linking.openSettings();
    } catch {
      setPermissionError(true);
    }
  }

  async function handlePermissionRefresh() {
    setPermissionError(false);

    try {
      await getPermission();
    } catch {
      setPermissionError(true);
    }
  }

  if (permissionKind === 'checking') {
    return (
      <Screen edges={['bottom']}>
        <StatusContent
          busy
          message="Comprobando cámara…"
          supportingText="Estamos verificando el permiso sin activar la cámara."
        />
      </Screen>
    );
  }

  if (permissionKind !== 'ready') {
    const needsSettings = permissionKind === 'denied-settings';
    const isRequired = permissionKind === 'required';

    return (
      <Screen edges={['bottom']}>
        <StatusContent
          message={
            isRequired ? 'Permiso de cámara' : 'No podemos usar la cámara'
          }
          supportingText={
            needsSettings
              ? 'Activa el permiso de cámara para StockApp desde la configuración del dispositivo.'
              : 'StockApp necesita usar la cámara para leer códigos de barras de productos.'
          }
        >
          {permissionError ? (
            <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
              No pudimos completar la acción. Inténtalo nuevamente.
            </Text>
          ) : null}
          {needsSettings ? (
            <>
              <PrimaryAction
                label="Abrir configuración"
                onPress={() => void handleOpenSettings()}
              />
              <SecondaryAction
                label="Comprobar permiso"
                onPress={() => void handlePermissionRefresh()}
              />
            </>
          ) : (
            <PrimaryAction
              label={isRequired ? 'Permitir cámara' : 'Solicitar de nuevo'}
              onPress={() => void handlePermissionRequest()}
            />
          )}
          <SecondaryAction label="Volver" onPress={() => router.back()} />
        </StatusContent>
      </Screen>
    );
  }

  if (state.status === 'not-found') {
    const presentation = createBarcodeNotFoundPresentation(state.barcode);

    return (
      <Screen edges={['bottom']}>
        <StatusContent
          message={presentation.message}
          supportingText={presentation.supportingText}
        >
          <View style={styles.barcodeCard}>
            <Text style={styles.barcodeLabel}>Código leído</Text>
            <Text selectable style={styles.barcodeValue}>
              {state.barcode}
            </Text>
          </View>
          <PrimaryAction
            label={presentation.actions.createProduct}
            onPress={() =>
              router.replace(createProductNewRouteFromBarcode(state.barcode))
            }
          />
          <SecondaryAction
            label={presentation.actions.rescan}
            onPress={rearmScanner}
          />
          <SecondaryAction
            label={presentation.actions.back}
            onPress={() => router.back()}
          />
        </StatusContent>
      </Screen>
    );
  }

  if (state.status === 'lookup-error') {
    const presentation = createBarcodeScannerFailurePresentation('lookup');

    return (
      <Screen edges={['bottom']}>
        <StatusContent
          message={presentation.message}
          supportingText={presentation.supportingText}
        >
          <PrimaryAction
            label="Reintentar búsqueda"
            onPress={() => void resolveBarcode(state.barcode)}
          />
          <SecondaryAction label="Escanear de nuevo" onPress={rearmScanner} />
          <SecondaryAction label="Volver" onPress={() => router.back()} />
        </StatusContent>
      </Screen>
    );
  }

  if (state.status === 'camera-error') {
    const presentation = createBarcodeScannerFailurePresentation('camera');

    return (
      <Screen edges={['bottom']}>
        <StatusContent
          message={presentation.message}
          supportingText={presentation.supportingText}
        >
          <PrimaryAction
            label="Reintentar cámara"
            onPress={() => {
              scanGateRef.current.rearm();
              setCameraKey((current) => current + 1);
              setState({ status: 'ready' });
            }}
          />
          <SecondaryAction label="Volver" onPress={() => router.back()} />
        </StatusContent>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <View style={styles.scannerCopy}>
        <Text accessibilityRole="header" style={styles.title}>
          Escanear código
        </Text>
        <Text style={styles.supportingText}>
          Coloca el código de barras dentro del recuadro. La búsqueda se realiza
          solo en este dispositivo.
        </Text>
      </View>

      <View style={styles.cameraFrame}>
        <CameraView
          barcodeScannerSettings={{
            barcodeTypes: [...COMMERCIAL_BARCODE_TYPES],
          }}
          facing="back"
          key={cameraKey}
          onBarcodeScanned={
            state.status === 'ready' ? handleBarcodeScanned : undefined
          }
          onMountError={() => setState({ status: 'camera-error' })}
          style={styles.camera}
        />
        <View pointerEvents="none" style={styles.target} />
        {state.status === 'resolving' ? (
          <View accessibilityLiveRegion="polite" style={styles.resolving}>
            <ActivityIndicator color={colors.onAccent} size="large" />
            <Text style={styles.resolvingText}>Buscando producto…</Text>
          </View>
        ) : null}
      </View>

      <SecondaryAction label="Cancelar" onPress={() => router.back()} />
    </Screen>
  );
}

interface StatusContentProps {
  readonly busy?: boolean;
  readonly children?: React.ReactNode;
  readonly message: string;
  readonly supportingText: string;
}

function StatusContent({
  busy = false,
  children,
  message,
  supportingText,
}: StatusContentProps) {
  return (
    <View style={styles.status}>
      {busy ? <ActivityIndicator color={colors.accent} size="large" /> : null}
      <Text accessibilityRole="header" style={styles.statusTitle}>
        {message}
      </Text>
      <Text style={styles.statusText}>{supportingText}</Text>
      {children}
    </View>
  );
}

interface ActionProps {
  readonly label: string;
  readonly onPress: () => void;
}

function PrimaryAction({ label, onPress }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryAction,
        pressed && styles.primaryActionPressed,
      ]}
    >
      <Text style={styles.primaryActionText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryAction({ label, onPress }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryAction,
        pressed && styles.secondaryActionPressed,
      ]}
    >
      <Text style={styles.secondaryActionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  barcodeCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  barcodeLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  barcodeValue: {
    color: colors.text,
    fontSize: typography.size.section,
    fontWeight: typography.weight.bold,
  },
  camera: {
    flex: 1,
  },
  cameraFrame: {
    backgroundColor: colors.text,
    borderRadius: radii.lg,
    height: 420,
    overflow: 'hidden',
    position: 'relative',
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.caption,
    lineHeight: 18,
    textAlign: 'center',
  },
  primaryAction: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  primaryActionPressed: {
    backgroundColor: colors.accentPressed,
  },
  primaryActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  resolving: {
    alignItems: 'center',
    backgroundColor: 'rgba(25, 34, 28, 0.78)',
    bottom: 0,
    gap: spacing.md,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  resolvingText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  scannerCopy: {
    gap: spacing.sm,
  },
  secondaryAction: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  secondaryActionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  secondaryActionText: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  status: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 360,
    width: '100%',
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
    maxWidth: 460,
    textAlign: 'center',
  },
  statusTitle: {
    color: colors.text,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  supportingText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
  },
  target: {
    borderColor: colors.onAccent,
    borderRadius: radii.md,
    borderWidth: 3,
    height: 150,
    left: '10%',
    position: 'absolute',
    top: 135,
    width: '80%',
  },
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.8,
  },
});
