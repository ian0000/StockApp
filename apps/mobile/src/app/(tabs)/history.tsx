import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { HistoryEntry } from '@stock-app/application';

import { EmptyState } from '@/ui/components/EmptyState';
import { Screen } from '@/ui/components/Screen';
import { HistoryOperationRow } from '@/ui/history/HistoryOperationRow';
import { createPurchaseDetailsRoute } from '@/ui/purchases/purchase-details-presentation';
import { createSaleDetailsRoute } from '@/ui/sales/sale-details-presentation';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

type HistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly entries: readonly HistoryEntry[] }
  | { readonly status: 'error' };

export default function HistoryScreen() {
  const router = useRouter();
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
              variant="history"
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.8,
  },
});
