import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  ProductSummary,
  SalesSummary,
  TopSellingProduct,
} from '@stock-app/application';
import { Money } from '@stock-app/domain';

import { EmptyState } from '@/ui/components/EmptyState';
import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import { HistoryOperationRow } from '@/ui/history/HistoryOperationRow';
import {
  createRecentOperationsRequest,
  getRecentOperationsContentKind,
  HISTORY_TAB_ROUTE,
  type RecentOperationsState,
} from '@/ui/history/history-presentation';
import { getLocalDayRange } from '@/ui/home/local-day-range';
import {
  createHomeLowStockPresentation,
  createTopSellingProductPresentation,
  getHomeBlockContentKind,
  PRODUCTS_TAB_ROUTE,
  type HomeBlockState,
} from '@/ui/home/home-dashboard-presentation';
import { createPurchaseDetailsRoute } from '@/ui/purchases/purchase-details-presentation';
import { createSaleDetailsRoute } from '@/ui/sales/sale-details-presentation';
import { formatMoneyForDisplay } from '@/ui/products/product-form-values';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';

const EMPTY_SUMMARY: SalesSummary = Object.freeze({
  estimatedProfit: Money.zero(),
  totalAmount: Money.zero(),
  unitsSold: 0,
});

type SummaryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly summary: SalesSummary }
  | { readonly status: 'error' };

interface MetricProps {
  readonly label: string;
  readonly value: string;
}

function Metric({ label, value }: MetricProps) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const {
    historyServices,
    inventory,
    persistence,
    productServices,
    saleServices,
  } = useAppRuntime();
  const summaryRequestIdRef = useRef(0);
  const lowStockRequestIdRef = useRef(0);
  const topSellerRequestIdRef = useRef(0);
  const recentRequestIdRef = useRef(0);
  const [summaryState, setSummaryState] = useState<SummaryState>({
    status: 'loading',
  });
  const [recentOperationsState, setRecentOperationsState] =
    useState<RecentOperationsState>({ status: 'loading' });
  const [lowStockState, setLowStockState] = useState<
    HomeBlockState<readonly ProductSummary[]>
  >({ status: 'loading' });
  const [topSellerState, setTopSellerState] = useState<
    HomeBlockState<TopSellingProduct>
  >({ status: 'loading' });

  const loadSummary = useCallback(
    async (range = getLocalDayRange(Date.now())) => {
      const requestId = summaryRequestIdRef.current + 1;
      summaryRequestIdRef.current = requestId;

      if (saleServices === null) {
        setSummaryState({ status: 'ready', summary: EMPTY_SUMMARY });
        return;
      }

      setSummaryState({ status: 'loading' });

      try {
        const summary = await saleServices.getSalesSummary.execute({
          inventoryId: inventory.id,
          ...range,
        });

        if (summaryRequestIdRef.current === requestId) {
          setSummaryState({ status: 'ready', summary });
        }
      } catch {
        if (summaryRequestIdRef.current === requestId) {
          setSummaryState({ status: 'error' });
        }
      }
    },
    [inventory.id, saleServices],
  );

  const loadLowStock = useCallback(async () => {
    const requestId = lowStockRequestIdRef.current + 1;
    lowStockRequestIdRef.current = requestId;

    if (productServices === null) {
      setLowStockState({ status: 'ready', value: [] });
      return;
    }

    setLowStockState({ status: 'loading' });

    try {
      const products = await productServices.listProducts.execute({
        inventoryId: inventory.id,
      });

      if (lowStockRequestIdRef.current === requestId) {
        setLowStockState({ status: 'ready', value: products });
      }
    } catch {
      if (lowStockRequestIdRef.current === requestId) {
        setLowStockState({ status: 'error' });
      }
    }
  }, [inventory.id, productServices]);

  const loadTopSeller = useCallback(
    async (range = getLocalDayRange(Date.now())) => {
      const requestId = topSellerRequestIdRef.current + 1;
      topSellerRequestIdRef.current = requestId;

      if (saleServices === null) {
        setTopSellerState({ status: 'ready', value: null });
        return;
      }

      setTopSellerState({ status: 'loading' });

      try {
        const value = await saleServices.getTopSellingProduct.execute({
          inventoryId: inventory.id,
          ...range,
        });

        if (topSellerRequestIdRef.current === requestId) {
          setTopSellerState({ status: 'ready', value });
        }
      } catch {
        if (topSellerRequestIdRef.current === requestId) {
          setTopSellerState({ status: 'error' });
        }
      }
    },
    [inventory.id, saleServices],
  );

  const loadRecentOperations = useCallback(async () => {
    const requestId = recentRequestIdRef.current + 1;
    recentRequestIdRef.current = requestId;

    if (historyServices === null) {
      setRecentOperationsState({ status: 'ready', entries: [] });
      return;
    }

    setRecentOperationsState({ status: 'loading' });

    try {
      const entries = await historyServices.listHistory.execute(
        createRecentOperationsRequest(inventory.id),
      );

      if (recentRequestIdRef.current === requestId) {
        setRecentOperationsState({ status: 'ready', entries });
      }
    } catch {
      if (recentRequestIdRef.current === requestId) {
        setRecentOperationsState({ status: 'error' });
      }
    }
  }, [historyServices, inventory.id]);

  useFocusEffect(
    useCallback(() => {
      const today = getLocalDayRange(Date.now());

      void loadSummary(today);
      void loadLowStock();
      void loadTopSeller(today);
      void loadRecentOperations();

      return () => {
        summaryRequestIdRef.current += 1;
        lowStockRequestIdRef.current += 1;
        topSellerRequestIdRef.current += 1;
        recentRequestIdRef.current += 1;
      };
    }, [loadLowStock, loadRecentOperations, loadSummary, loadTopSeller]),
  );

  const summary = summaryState.status === 'ready' ? summaryState.summary : null;
  const salesValue =
    summary === null
      ? '—'
      : formatMoneyForDisplay(summary.totalAmount, inventory.currency);
  const profitValue =
    summary === null || summary.estimatedProfit === null
      ? '—'
      : formatMoneyForDisplay(summary.estimatedProfit, inventory.currency);
  const unitsValue = summary === null ? '—' : String(summary.unitsSold);
  const recentContentKind = getRecentOperationsContentKind(
    recentOperationsState,
  );
  const lowStockPresentation =
    lowStockState.status === 'ready' && lowStockState.value !== null
      ? createHomeLowStockPresentation(lowStockState.value)
      : null;
  const topSellerContentKind = getHomeBlockContentKind(topSellerState);
  const topSellerPresentation =
    topSellerState.status === 'ready' && topSellerState.value !== null
      ? createTopSellingProductPresentation(topSellerState.value)
      : null;

  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {inventory.name}
        </Text>
        {persistence === 'web-preview' ? (
          <Text style={styles.previewText}>
            Vista previa web · Los datos no se guardan.
          </Text>
        ) : null}
      </View>

      <Section title="Hoy">
        <View accessibilityLiveRegion="polite" style={styles.summaryCard}>
          <Metric label="Ventas" value={salesValue} />
          <View style={styles.metricDivider} />
          <Metric label="Ganancia estimada" value={profitValue} />
          <View style={styles.metricDivider} />
          <Metric label="Unidades" value={unitsValue} />
        </View>
        {summaryState.status === 'loading' ? (
          <View style={styles.summaryStatus}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.summaryStatusText}>Actualizando resumen…</Text>
          </View>
        ) : null}
        {summaryState.status === 'ready' &&
        summaryState.summary.estimatedProfit === null ? (
          <Text style={styles.summarySupportingText}>
            Ganancia no disponible porque alguna venta no tiene costo conocido.
          </Text>
        ) : null}
        {summaryState.status === 'error' ? (
          <View style={styles.summaryError}>
            <Text
              accessibilityLiveRegion="assertive"
              style={styles.summaryErrorText}
            >
              No pudimos cargar el resumen de hoy.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadSummary()}
              style={({ pressed }) => [
                styles.retryAction,
                pressed && styles.retryActionPressed,
              ]}
            >
              <Text style={styles.retryActionText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}
      </Section>

      <View style={styles.actions}>
        <Pressable
          accessibilityHint="Abre la pantalla de nueva venta"
          accessibilityLabel="Nueva venta"
          accessibilityRole="button"
          onPress={() => router.push('/sale')}
          style={({ pressed }) => [
            styles.action,
            styles.primaryAction,
            pressed && styles.primaryActionPressed,
          ]}
        >
          <Text style={styles.primaryActionText}>+ Venta</Text>
        </Pressable>

        <Pressable
          accessibilityHint="Abre la pantalla de nueva compra"
          accessibilityLabel="Nueva compra"
          accessibilityRole="button"
          onPress={() => router.push('/purchase')}
          style={({ pressed }) => [
            styles.action,
            styles.secondaryAction,
            pressed && styles.secondaryActionPressed,
          ]}
        >
          <Text style={styles.secondaryActionText}>+ Compra</Text>
        </Pressable>
      </View>

      <Section title="Stock bajo">
        {lowStockState.status === 'loading' ? (
          <View accessibilityLiveRegion="polite" style={styles.blockStatus}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.summaryStatusText}>Revisando existencias…</Text>
          </View>
        ) : null}
        {lowStockState.status === 'error' ? (
          <View style={styles.blockStatus}>
            <Text
              accessibilityLiveRegion="assertive"
              style={styles.summaryErrorText}
            >
              No pudimos revisar el stock bajo.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadLowStock()}
              style={({ pressed }) => [
                styles.retryAction,
                pressed && styles.retryActionPressed,
              ]}
            >
              <Text style={styles.retryActionText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}
        {lowStockPresentation !== null ? (
          <Pressable
            accessibilityHint="Abre la lista de productos"
            accessibilityRole="button"
            onPress={() => router.push(PRODUCTS_TAB_ROUTE)}
            style={({ pressed }) => [
              styles.dashboardCard,
              pressed && styles.dashboardCardPressed,
            ]}
          >
            <View style={styles.dashboardCardText}>
              <Text style={styles.dashboardCardTitle}>
                {lowStockPresentation.message}
              </Text>
              <Text style={styles.dashboardCardSupportingText}>
                {lowStockPresentation.count === 0
                  ? 'No hay productos que necesiten reposición.'
                  : 'Revisa el catálogo para planificar la reposición.'}
              </Text>
              {lowStockPresentation.preview.map((product) => (
                <View key={product.productId} style={styles.lowStockPreviewRow}>
                  <View style={styles.dashboardCardText}>
                    <Text style={styles.lowStockPreviewName}>
                      {product.name}
                    </Text>
                    {product.variant === null ? null : (
                      <Text style={styles.dashboardCardSupportingText}>
                        {product.variant}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.lowStockPreviewStock}>
                    {product.stockLabel}
                  </Text>
                </View>
              ))}
            </View>
            <Text accessibilityElementsHidden style={styles.dashboardArrow}>
              ›
            </Text>
          </Pressable>
        ) : null}
      </Section>

      <Section title="Producto más vendido hoy">
        {topSellerContentKind === 'loading' ? (
          <View accessibilityLiveRegion="polite" style={styles.blockStatus}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.summaryStatusText}>Calculando resultado…</Text>
          </View>
        ) : null}
        {topSellerContentKind === 'error' ? (
          <View style={styles.blockStatus}>
            <Text
              accessibilityLiveRegion="assertive"
              style={styles.summaryErrorText}
            >
              No pudimos cargar el producto más vendido.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadTopSeller()}
              style={({ pressed }) => [
                styles.retryAction,
                pressed && styles.retryActionPressed,
              ]}
            >
              <Text style={styles.retryActionText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}
        {topSellerContentKind === 'empty' ? (
          <EmptyState
            message="Aún no hay ventas hoy"
            supportingText="Aquí aparecerá el producto con más unidades vendidas."
          />
        ) : null}
        {topSellerPresentation !== null ? (
          <Pressable
            accessibilityHint="Abre el detalle del producto"
            accessibilityRole="button"
            onPress={() => router.push(topSellerPresentation.route)}
            style={({ pressed }) => [
              styles.dashboardCard,
              pressed && styles.dashboardCardPressed,
            ]}
          >
            <View style={styles.dashboardCardText}>
              <Text style={styles.dashboardCardTitle}>
                {topSellerPresentation.name}
              </Text>
              {topSellerPresentation.variant === null ? null : (
                <Text style={styles.dashboardCardSupportingText}>
                  {topSellerPresentation.variant}
                </Text>
              )}
              <Text style={styles.topSellerUnits}>
                {topSellerPresentation.unitsLabel}
              </Text>
            </View>
            <Text accessibilityElementsHidden style={styles.dashboardArrow}>
              ›
            </Text>
          </Pressable>
        ) : null}
      </Section>

      <Section title="RECIENTES" titleVariant="eyebrow">
        {recentContentKind === 'loading' ? (
          <View accessibilityLiveRegion="polite" style={styles.recentStatus}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.summaryStatusText}>Cargando operaciones…</Text>
          </View>
        ) : null}

        {recentContentKind === 'error' ? (
          <View style={styles.recentStatus}>
            <Text
              accessibilityLiveRegion="assertive"
              style={styles.summaryErrorText}
            >
              No pudimos cargar las operaciones recientes.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadRecentOperations()}
              style={({ pressed }) => [
                styles.retryAction,
                pressed && styles.retryActionPressed,
              ]}
            >
              <Text style={styles.retryActionText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        {recentContentKind === 'empty' ? (
          <EmptyState
            message="Aún no hay operaciones"
            supportingText="Tus ventas, compras y ajustes recientes aparecerán aquí."
          />
        ) : null}

        {recentOperationsState.status === 'ready' &&
        recentOperationsState.entries.length > 0 ? (
          <View accessibilityRole="list" style={styles.recentList}>
            {recentOperationsState.entries.map((entry) => (
              <HistoryOperationRow
                currency={inventory.currency}
                entry={entry}
                key={`${entry.type}:${entry.id}`}
                onOpenPurchase={(purchaseId) =>
                  router.push(createPurchaseDetailsRoute(purchaseId))
                }
                onOpenSale={(saleId) =>
                  router.push(createSaleDetailsRoute(saleId))
                }
                variant="recent"
              />
            ))}
          </View>
        ) : null}

        <Pressable
          accessibilityHint="Abre el historial completo"
          accessibilityRole="link"
          onPress={() => router.push(HISTORY_TAB_ROUTE)}
          style={({ pressed }) => [
            styles.historyAction,
            pressed && styles.historyActionPressed,
          ]}
        >
          <Text style={styles.historyActionText}>Ver historial</Text>
        </Pressable>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 136,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    width: '100%',
  },
  blockStatus: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 96,
  },
  dashboardArrow: {
    color: colors.accent,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
  },
  dashboardCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 88,
    padding: spacing.lg,
  },
  dashboardCardPressed: {
    backgroundColor: colors.accentSoft,
  },
  dashboardCardSupportingText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  dashboardCardText: {
    flex: 1,
    gap: spacing.xs,
  },
  dashboardCardTitle: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  header: {
    paddingBottom: spacing.xs,
    paddingTop: spacing.sm,
  },
  historyAction: {
    alignSelf: 'flex-start',
    borderRadius: radii.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  historyActionPressed: {
    backgroundColor: colors.accentSoft,
  },
  historyActionText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  metric: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 72,
  },
  lowStockPreviewName: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.medium,
  },
  lowStockPreviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  lowStockPreviewStock: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  metricDivider: {
    alignSelf: 'stretch',
    backgroundColor: colors.border,
    width: 1,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  metricValue: {
    color: colors.text,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.4,
  },
  primaryAction: {
    backgroundColor: colors.accent,
  },
  primaryActionPressed: {
    backgroundColor: colors.accentPressed,
  },
  primaryActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  recentList: {
    gap: spacing.sm,
  },
  recentStatus: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 96,
  },
  previewText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  retryAction: {
    borderColor: colors.accent,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryActionPressed: {
    backgroundColor: colors.accentSoft,
  },
  retryActionText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  secondaryAction: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
  },
  secondaryActionPressed: {
    backgroundColor: colors.accentSoft,
  },
  secondaryActionText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  summaryError: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryErrorText: {
    color: colors.danger,
    fontSize: typography.size.caption,
    textAlign: 'center',
  },
  summaryStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  summaryStatusText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  summarySupportingText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.8,
  },
  topSellerUnits: {
    color: colors.accent,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
    lineHeight: 18,
  },
});
