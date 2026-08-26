import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { HistoryEntry } from '@stock-app/application';

import {
  adjustmentReasonLabel,
  formatSignedDifference,
} from '@/ui/adjustments/stock-adjustment-form';
import { EmptyState } from '@/ui/components/EmptyState';
import { Screen } from '@/ui/components/Screen';
import { formatMoneyForDisplay } from '@/ui/products/product-form-values';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

type HistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly entries: readonly HistoryEntry[] }
  | { readonly status: 'error' };

const HISTORY_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function formatHistoryTimestamp(timestamp: number): string {
  return HISTORY_DATE_TIME_FORMATTER.format(new Date(timestamp));
}

export default function HistoryScreen() {
  const { historyServices, inventory, persistence } = useAppRuntime();
  const requestIdRef = useRef(0);
  const [historyState, setHistoryState] = useState<HistoryState>({
    status: 'loading',
  });

  const loadHistory = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (historyServices === null) {
      setHistoryState({ status: 'ready', entries: [] });
      return;
    }

    setHistoryState({ status: 'loading' });

    try {
      const entries = await historyServices.listHistory.execute({
        inventoryId: inventory.id,
        limit: 50,
      });

      if (requestIdRef.current === requestId) {
        setHistoryState({ status: 'ready', entries });
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setHistoryState({ status: 'error' });
      }
    }
  }, [historyServices, inventory.id]);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();

      return () => {
        requestIdRef.current += 1;
      };
    }, [loadHistory]),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Historial
        </Text>
        {persistence === 'web-preview' ? (
          <Text style={styles.previewText}>
            Vista previa web · El historial persistido está disponible en iOS y
            Android.
          </Text>
        ) : null}
      </View>

      {historyState.status === 'loading' ? (
        <View accessibilityLiveRegion="polite" style={styles.status}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.secondaryText}>Cargando operaciones…</Text>
        </View>
      ) : null}

      {historyState.status === 'error' ? (
        <View style={styles.status}>
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
            No pudimos cargar el historial.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadHistory()}
            style={({ pressed }) => [
              styles.retryAction,
              pressed && styles.retryActionPressed,
            ]}
          >
            <Text style={styles.retryActionText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {historyState.status === 'ready' && historyState.entries.length === 0 ? (
        <EmptyState
          message="Aún no hay operaciones"
          supportingText="Cuando registres ventas, compras o ajustes, aparecerán aquí."
        />
      ) : null}

      {historyState.status === 'ready' && historyState.entries.length > 0 ? (
        <View accessibilityRole="list" style={styles.list}>
          {historyState.entries.map((entry) => (
            <HistoryRow
              currency={inventory.currency}
              entry={entry}
              key={`${entry.type}:${entry.id}`}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function HistoryRow({
  currency,
  entry,
}: {
  readonly currency: string;
  readonly entry: HistoryEntry;
}) {
  switch (entry.type) {
    case 'SALE':
      return (
        <OperationRow
          detail={`${entry.units} ${entry.units === 1 ? 'unidad' : 'unidades'}`}
          isVoided={entry.status === 'VOIDED'}
          primary={formatMoneyForDisplay(entry.totalAmount, currency)}
          timestamp={entry.effectiveAt}
          typeLabel="VENTA"
        />
      );
    case 'PURCHASE':
      return (
        <OperationRow
          detail={`+${entry.quantity} · ${formatMoneyForDisplay(
            entry.unitCost,
            currency,
          )} c/u`}
          isVoided={entry.status === 'VOIDED'}
          primary={entry.productName}
          secondary={entry.productVariant}
          timestamp={entry.effectiveAt}
          typeLabel="COMPRA"
        />
      );
    case 'ADJUSTMENT':
      return (
        <OperationRow
          detail={`${formatSignedDifference(entry.difference)} · ${adjustmentReasonLabel(
            entry.reason,
          )}`}
          primary={entry.productName}
          secondary={entry.productVariant}
          timestamp={entry.effectiveAt}
          typeLabel="AJUSTE"
        />
      );
  }
}

interface OperationRowProps {
  readonly typeLabel: string;
  readonly primary: string;
  readonly secondary?: string | null;
  readonly detail: string;
  readonly timestamp: number;
  readonly isVoided?: boolean;
}

function OperationRow({
  typeLabel,
  primary,
  secondary,
  detail,
  timestamp,
  isVoided = false,
}: OperationRowProps) {
  return (
    <View accessibilityRole="summary" style={styles.row}>
      <View style={styles.rowCopy}>
        <View style={styles.typeLine}>
          <Text style={styles.typeLabel}>{typeLabel}</Text>
          {isVoided ? <Text style={styles.voidedLabel}>Anulada</Text> : null}
        </View>
        <Text style={[styles.primary, isVoided && styles.voidedText]}>
          {primary}
        </Text>
        {secondary ? (
          <Text style={styles.secondaryText}>{secondary}</Text>
        ) : null}
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <Text style={styles.timestamp}>{formatHistoryTimestamp(timestamp)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  detail: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.body,
    textAlign: 'center',
  },
  header: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  list: { gap: spacing.md },
  previewText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  primary: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  retryAction: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  retryActionPressed: { backgroundColor: colors.accentSoft },
  retryActionText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  row: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 112,
    padding: spacing.lg,
  },
  rowCopy: { flex: 1, gap: spacing.xs },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  status: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 220,
  },
  timestamp: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    textAlign: 'right',
  },
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.8,
  },
  typeLabel: {
    color: colors.accent,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.8,
  },
  typeLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  voidedLabel: {
    color: colors.danger,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  voidedText: { textDecorationLine: 'line-through' },
});
