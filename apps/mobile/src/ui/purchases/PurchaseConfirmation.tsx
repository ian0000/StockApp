import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Purchase } from '@stock-app/domain';

import { formatMoneyForDisplay } from '../products/product-form-values';
import {
  formatAverageCostTransition,
  formatStockTransition,
} from './purchase-form';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface PurchaseConfirmationProps {
  readonly currency: string;
  readonly onGoProducts: () => void;
  readonly onNewPurchase: () => void;
  readonly purchase: Purchase;
}

export function PurchaseConfirmation({
  currency,
  onGoProducts,
  onNewPurchase,
  purchase,
}: PurchaseConfirmationProps) {
  return (
    <View style={styles.container}>
      <View accessibilityLabel="Compra registrada" style={styles.successMark}>
        <Text style={styles.successMarkText}>✓</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        Compra registrada
      </Text>

      <View style={styles.summaryCard}>
        <SummaryRow
          label="Total de compra"
          value={formatMoneyForDisplay(purchase.totalAmount, currency)}
        />
        <SummaryRow
          label="Stock"
          value={formatStockTransition(
            purchase.stockBefore,
            purchase.stockAfter,
          )}
        />
        <SummaryRow
          label="Costo promedio"
          value={formatAverageCostTransition(
            purchase.averageCostBefore,
            purchase.averageCostAfter,
            currency,
          )}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onNewPurchase}
        style={({ pressed }) => [
          styles.primaryAction,
          pressed && styles.primaryActionPressed,
        ]}
      >
        <Text style={styles.primaryActionText}>Nueva compra</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onGoProducts}
        style={({ pressed }) => [
          styles.secondaryAction,
          pressed && styles.secondaryActionPressed,
        ]}
      >
        <Text style={styles.secondaryActionText}>Ir a productos</Text>
      </Pressable>
    </View>
  );
}

function SummaryRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.xl,
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
  secondaryAction: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderColor: colors.accent,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  secondaryActionPressed: {
    backgroundColor: colors.accentSoft,
  },
  secondaryActionText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  successMark: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  successMarkText: {
    color: colors.onAccent,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
  },
  summaryCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.semibold,
  },
  summaryRow: {
    gap: spacing.xs,
  },
  summaryValue: {
    color: colors.text,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
});
