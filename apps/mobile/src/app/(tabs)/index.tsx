import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { SalesSummary } from '@stock-app/application';
import { Money } from '@stock-app/domain';

import { EmptyState } from '@/ui/components/EmptyState';
import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import { getLocalDayRange } from '@/ui/home/local-day-range';
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
  const { inventory, persistence, saleServices } = useAppRuntime();
  const requestIdRef = useRef(0);
  const [summaryState, setSummaryState] = useState<SummaryState>({
    status: 'loading',
  });

  const loadSummary = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (saleServices === null) {
      setSummaryState({ status: 'ready', summary: EMPTY_SUMMARY });
      return;
    }

    setSummaryState({ status: 'loading' });

    try {
      const range = getLocalDayRange(Date.now());
      const summary = await saleServices.getSalesSummary.execute({
        inventoryId: inventory.id,
        ...range,
      });

      if (requestIdRef.current === requestId) {
        setSummaryState({ status: 'ready', summary });
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setSummaryState({ status: 'error' });
      }
    }
  }, [inventory.id, saleServices]);

  useFocusEffect(
    useCallback(() => {
      void loadSummary();

      return () => {
        requestIdRef.current += 1;
      };
    }, [loadSummary]),
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
        <EmptyState
          message="Todo en orden por ahora"
          supportingText="Los productos con poco stock aparecerán aquí."
        />
      </Section>

      <Section title="RECIENTES" titleVariant="eyebrow">
        <EmptyState
          message="Aún no hay movimientos"
          supportingText="Tus ventas y compras recientes aparecerán aquí."
        />
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
  header: {
    paddingBottom: spacing.xs,
    paddingTop: spacing.sm,
  },
  metric: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 72,
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
});
