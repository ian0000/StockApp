import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import {
  createProductDetailsPresentation,
  createProductDetailsRequest,
  getProductDetailsContentKind,
  normalizeProductIdParam,
  type ProductDetailsState,
} from '@/ui/products/product-details-presentation';
import { createProductEditRoute } from '@/ui/products/product-edit-presentation';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

export default function ProductDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const productId = normalizeProductIdParam(params.id);
  const { inventory, persistence, productServices } = useAppRuntime();
  const requestIdRef = useRef(0);
  const archivingRef = useRef(false);
  const [state, setState] = useState<ProductDetailsState>({
    status: 'loading',
  });
  const [archiveConfirmationVisible, setArchiveConfirmationVisible] =
    useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  const loadDetails = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (productServices === null || productId === null) {
      setState({ status: 'ready', details: null });
      return;
    }

    setState({ status: 'loading' });

    try {
      const details = await productServices.getProductDetails.execute(
        createProductDetailsRequest(inventory.id, productId),
      );

      if (requestIdRef.current === requestId) {
        setState({ status: 'ready', details });
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setState({ status: 'error' });
      }
    }
  }, [inventory.id, productId, productServices]);

  useFocusEffect(
    useCallback(() => {
      setArchiveConfirmationVisible(false);
      setArchiveError(null);
      void loadDetails();

      return () => {
        requestIdRef.current += 1;
      };
    }, [loadDetails]),
  );

  async function handleArchive() {
    if (
      archivingRef.current ||
      productServices === null ||
      productId === null
    ) {
      return;
    }

    setArchiveError(null);
    archivingRef.current = true;
    setIsArchiving(true);

    try {
      await productServices.archiveProduct.execute({
        inventoryId: inventory.id,
        productId,
      });
      router.replace('/products');
    } catch {
      setArchiveError(
        'No pudimos archivar el producto. Tus datos no fueron modificados.',
      );
      archivingRef.current = false;
      setIsArchiving(false);
    }
  }

  const contentKind = getProductDetailsContentKind(state);
  const presentation =
    state.status === 'ready' && state.details !== null
      ? createProductDetailsPresentation(state.details, inventory.currency)
      : null;

  return (
    <Screen edges={['bottom']}>
      {persistence === 'web-preview' ? (
        <Text style={styles.previewText}>
          Vista previa web · Los detalles persistidos están disponibles en iOS y
          Android.
        </Text>
      ) : null}

      {contentKind === 'loading' ? (
        <View accessibilityLiveRegion="polite" style={styles.status}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.statusText}>Cargando producto…</Text>
        </View>
      ) : null}

      {contentKind === 'not-found' ? (
        <StatusMessage
          message="Producto no disponible"
          supportingText="No pudimos encontrar este producto en tu inventario."
          onBack={() => router.back()}
        />
      ) : null}

      {contentKind === 'error' ? (
        <StatusMessage
          message="No pudimos cargar el producto"
          supportingText="Inténtalo nuevamente. Tus datos no fueron modificados."
          onBack={() => router.back()}
          onRetry={() => void loadDetails()}
        />
      ) : null}

      {presentation !== null ? (
        <View accessibilityLiveRegion="polite" style={styles.content}>
          <View style={styles.identity}>
            <Text accessibilityRole="header" style={styles.title}>
              {presentation.name}
            </Text>
            {presentation.variant !== null ? (
              <Text style={styles.variant}>{presentation.variant}</Text>
            ) : null}
          </View>

          <Section title="Stock" titleVariant="eyebrow">
            <View style={styles.stockCard}>
              <Text
                accessibilityLabel={`Stock actual: ${presentation.stockLabel}`}
                style={[
                  styles.stockValue,
                  presentation.stockStatus === 'negative' &&
                    styles.negativeValue,
                ]}
              >
                {presentation.stockLabel}
              </Text>
              {presentation.stockStatus === 'negative' ? (
                <Text style={styles.negativeSupportingText}>
                  El inventario está por debajo de cero.
                </Text>
              ) : null}
              {presentation.lowStockLabel !== null ? (
                <Text style={styles.lowStockText}>
                  {presentation.lowStockLabel}
                </Text>
              ) : null}
              <Text style={styles.minimumStockText}>
                {presentation.minimumStockLabel}
              </Text>
            </View>
          </Section>

          <Section title="Precio y costo" titleVariant="eyebrow">
            <View style={styles.card}>
              <DetailRow
                label="Precio habitual"
                value={presentation.priceLabel}
              />
              <View style={styles.divider} />
              <DetailRow label="Costo actual" value={presentation.costLabel} />
            </View>
          </Section>

          <Section title="Rentabilidad" titleVariant="eyebrow">
            <View style={styles.card}>
              <DetailRow
                label="Ganancia aprox. / unidad"
                value={presentation.estimatedUnitProfitLabel}
              />
              <View style={styles.divider} />
              <DetailRow
                label="Margen aprox."
                value={presentation.marginLabel}
              />
              <View style={styles.divider} />
              <DetailRow
                label="Markup aprox."
                value={presentation.markupLabel}
              />
            </View>
          </Section>

          <Section title="Gestionar producto" titleVariant="eyebrow">
            <View style={styles.managementActions}>
              <Pressable
                accessibilityLabel="Editar producto"
                accessibilityRole="button"
                disabled={isArchiving || productId === null}
                onPress={() => {
                  if (productId !== null) {
                    router.push(createProductEditRoute(productId));
                  }
                }}
                style={({ pressed }) => [
                  styles.editAction,
                  pressed && styles.editActionPressed,
                ]}
              >
                <Text style={styles.editActionText}>Editar</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Archivar producto"
                accessibilityRole="button"
                disabled={isArchiving}
                onPress={() => {
                  setArchiveError(null);
                  setArchiveConfirmationVisible(true);
                }}
                style={({ pressed }) => [
                  styles.archiveAction,
                  pressed && styles.archiveActionPressed,
                ]}
              >
                <Text style={styles.archiveActionText}>Archivar</Text>
              </Pressable>
            </View>

            {archiveConfirmationVisible ? (
              <View
                accessibilityLiveRegion="polite"
                style={styles.archiveConfirmation}
              >
                <Text style={styles.archiveConfirmationTitle}>
                  ¿Archivar producto?
                </Text>
                <Text style={styles.archiveConfirmationText}>
                  Dejará de aparecer en tu lista de productos, pero sus
                  operaciones anteriores se conservarán.
                </Text>
                <View style={styles.confirmationActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isArchiving}
                    onPress={() => setArchiveConfirmationVisible(false)}
                    style={({ pressed }) => [
                      styles.cancelAction,
                      pressed && styles.cancelActionPressed,
                    ]}
                  >
                    <Text style={styles.cancelActionText}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ busy: isArchiving }}
                    disabled={isArchiving}
                    onPress={() => void handleArchive()}
                    style={({ pressed }) => [
                      styles.confirmArchiveAction,
                      pressed && styles.confirmArchiveActionPressed,
                      isArchiving && styles.disabledAction,
                    ]}
                  >
                    {isArchiving ? (
                      <ActivityIndicator color={colors.onAccent} />
                    ) : (
                      <Text style={styles.confirmArchiveActionText}>
                        Archivar
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            {archiveError ? (
              <Text
                accessibilityLiveRegion="assertive"
                style={styles.errorText}
              >
                {archiveError}
              </Text>
            ) : null}
          </Section>
        </View>
      ) : null}
    </Screen>
  );
}

interface DetailRowProps {
  readonly label: string;
  readonly value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

interface StatusMessageProps {
  readonly message: string;
  readonly supportingText: string;
  readonly onBack: () => void;
  readonly onRetry?: () => void;
}

function StatusMessage({
  message,
  supportingText,
  onBack,
  onRetry,
}: StatusMessageProps) {
  return (
    <View style={styles.status}>
      <Text accessibilityRole="header" style={styles.statusTitle}>
        {message}
      </Text>
      <Text accessibilityLiveRegion="assertive" style={styles.statusText}>
        {supportingText}
      </Text>
      <View style={styles.statusActions}>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryAction,
              pressed && styles.retryActionPressed,
            ]}
          >
            <Text style={styles.retryActionText}>Reintentar</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backAction,
            pressed && styles.backActionPressed,
          ]}
        >
          <Text style={styles.backActionText}>Volver</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  archiveAction: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  archiveActionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  archiveActionText: {
    color: colors.danger,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  archiveConfirmation: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  archiveConfirmationText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
  },
  archiveConfirmationTitle: {
    color: colors.text,
    fontSize: typography.size.section,
    fontWeight: typography.weight.bold,
  },
  backAction: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backActionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  backActionText: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  cancelAction: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cancelActionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  cancelActionText: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  content: {
    gap: spacing.xl,
  },
  confirmationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  confirmArchiveAction: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  confirmArchiveActionPressed: {
    opacity: 0.82,
  },
  confirmArchiveActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  detailLabel: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: typography.size.body,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: spacing.md,
  },
  detailValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    textAlign: 'right',
  },
  divider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
  },
  disabledAction: {
    opacity: 0.58,
  },
  editAction: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  editActionPressed: {
    backgroundColor: colors.accentPressed,
  },
  editActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  identity: {
    gap: spacing.xs,
  },
  negativeSupportingText: {
    color: colors.danger,
    fontSize: typography.size.caption,
  },
  negativeValue: {
    color: colors.danger,
  },
  managementActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  lowStockText: {
    color: colors.danger,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  minimumStockText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  previewText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  retryAction: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  retryActionPressed: {
    backgroundColor: colors.accentPressed,
  },
  retryActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  status: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 240,
  },
  statusActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
    maxWidth: 420,
    textAlign: 'center',
  },
  statusTitle: {
    color: colors.text,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  stockCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  stockValue: {
    color: colors.text,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.8,
  },
  variant: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
  },
});
