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
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import {
  createSaleDetailsPresentation,
  createSaleDetailsRequest,
  getSaleDetailsContentKind,
  normalizeSaleIdParam,
  type SaleDetailsState,
} from '@/ui/sales/sale-details-presentation';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

export default function SaleDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const saleId = normalizeSaleIdParam(params.id);
  const { inventory, persistence, saleServices } = useAppRuntime();
  const requestIdRef = useRef(0);
  const [state, setState] = useState<SaleDetailsState>({ status: 'loading' });

  const loadDetails = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (saleServices === null || saleId === null) {
      setState({ status: 'ready', details: null });
      return;
    }

    setState({ status: 'loading' });

    try {
      const details = await saleServices.getSaleDetails.execute(
        createSaleDetailsRequest(inventory.id, saleId),
      );

      if (requestIdRef.current === requestId) {
        setState({ status: 'ready', details });
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setState({ status: 'error' });
      }
    }
  }, [inventory.id, saleId, saleServices]);

  useFocusEffect(
    useCallback(() => {
      void loadDetails();

      return () => {
        requestIdRef.current += 1;
      };
    }, [loadDetails]),
  );

  const contentKind = getSaleDetailsContentKind(state);
  const presentation =
    state.status === 'ready' && state.details !== null
      ? createSaleDetailsPresentation(state.details, inventory.currency)
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
          <Text style={styles.statusText}>Cargando venta…</Text>
        </View>
      ) : null}

      {contentKind === 'not-found' ? (
        <StatusMessage
          message="Venta no disponible"
          supportingText="No pudimos encontrar esta venta en tu inventario."
          onBack={() => router.back()}
        />
      ) : null}

      {contentKind === 'error' ? (
        <StatusMessage
          message="No pudimos cargar la venta"
          supportingText="Inténtalo nuevamente. Tus datos no fueron modificados."
          onBack={() => router.back()}
          onRetry={() => void loadDetails()}
        />
      ) : null}

      {presentation !== null ? (
        <View accessibilityLiveRegion="polite" style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titleLine}>
              <Text accessibilityRole="header" style={styles.title}>
                Venta
              </Text>
              <Text
                style={[
                  styles.statusBadge,
                  presentation.isVoided && styles.voidedBadge,
                ]}
              >
                {presentation.statusLabel}
              </Text>
            </View>
            <Text style={styles.date}>{presentation.dateLabel}</Text>
          </View>

          <Section title="Productos" titleVariant="eyebrow">
            <View accessibilityRole="list" style={styles.items}>
              {presentation.items.map((item) => (
                <View
                  accessibilityRole="summary"
                  key={item.id}
                  style={styles.itemCard}
                >
                  <Text style={styles.productName}>{item.productName}</Text>
                  {item.productVariant !== null ? (
                    <Text style={styles.secondaryText}>
                      {item.productVariant}
                    </Text>
                  ) : null}
                  <Text style={styles.quantityPrice}>
                    {item.quantityAndPriceLabel}
                  </Text>
                  <DetailRow label="Subtotal" value={item.subtotalLabel} />
                  <DetailRow
                    label="Costo unitario histórico"
                    value={item.unitCostLabel}
                  />
                  <DetailRow
                    label="Ganancia estimada"
                    value={item.estimatedProfitLabel}
                  />
                </View>
              ))}
            </View>
          </Section>

          <Section title="Resumen" titleVariant="eyebrow">
            <View style={styles.summaryCard}>
              <DetailRow
                label="Unidades"
                value={presentation.totalUnitsLabel}
              />
              <View style={styles.divider} />
              <DetailRow
                label="Costo histórico estimado"
                value={presentation.estimatedCostLabel}
              />
              <View style={styles.divider} />
              <DetailRow
                label="Ganancia estimada"
                value={presentation.estimatedProfitLabel}
              />
              <View style={styles.divider} />
              <DetailRow
                emphasized
                label="Total"
                value={presentation.totalAmountLabel}
              />
            </View>
          </Section>

          {presentation.notes !== null ? (
            <Section title="Notas" titleVariant="eyebrow">
              <View style={styles.notesCard}>
                <Text style={styles.notes}>{presentation.notes}</Text>
              </View>
            </Section>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

interface DetailRowProps {
  readonly emphasized?: boolean;
  readonly label: string;
  readonly value: string;
}

function DetailRow({ emphasized = false, label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, emphasized && styles.emphasizedText]}>
        {label}
      </Text>
      <Text style={[styles.detailValue, emphasized && styles.emphasizedValue]}>
        {value}
      </Text>
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
  backActionPressed: { backgroundColor: colors.surfaceMuted },
  backActionText: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  content: { gap: spacing.xl },
  date: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
  },
  detailLabel: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 36,
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
  emphasizedText: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  emphasizedValue: {
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
  },
  header: { gap: spacing.sm },
  itemCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  items: { gap: spacing.md },
  notes: {
    color: colors.text,
    fontSize: typography.size.body,
    lineHeight: 24,
  },
  notesCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.lg,
  },
  previewText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  productName: {
    color: colors.text,
    fontSize: typography.size.section,
    fontWeight: typography.weight.bold,
  },
  quantityPrice: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
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
  retryActionPressed: { backgroundColor: colors.accentPressed },
  retryActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
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
  statusBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
    color: colors.accent,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
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
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.8,
  },
  titleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  voidedBadge: {
    backgroundColor: colors.surfaceMuted,
    color: colors.danger,
  },
});
