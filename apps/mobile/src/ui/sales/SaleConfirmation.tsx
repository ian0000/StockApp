import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Sale } from '@stock-app/domain';

import { formatMoneyForDisplay } from '../products/product-form-values';
import { formatEstimatedProfitForDisplay } from './sale-confirmation';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface SaleConfirmationProps {
  readonly currency: string;
  readonly onGoHome: () => void;
  readonly onNewSale: () => void;
  readonly sale: Sale;
}

export function SaleConfirmation({
  currency,
  onGoHome,
  onNewSale,
  sale,
}: SaleConfirmationProps) {
  return (
    <View style={styles.container}>
      <View style={styles.successMark}>
        <Text accessibilityLabel="Venta registrada" style={styles.checkmark}>
          ✓
        </Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        Venta registrada
      </Text>

      <View style={styles.summaryCard}>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Total de venta</Text>
          <Text style={styles.metricValue}>
            {formatMoneyForDisplay(sale.totalAmount, currency)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Ganancia estimada</Text>
          <Text style={styles.metricValue}>
            {formatEstimatedProfitForDisplay(sale.estimatedProfit, currency)}
          </Text>
        </View>
        {sale.estimatedProfit === null ? (
          <Text style={styles.unknownCopy}>
            Costo no disponible para todos los productos.
          </Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onNewSale}
        style={({ pressed }) => [
          styles.primaryAction,
          pressed && styles.primaryActionPressed,
        ]}
      >
        <Text style={styles.primaryActionText}>Nueva venta</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onGoHome}
        style={({ pressed }) => [
          styles.secondaryAction,
          pressed && styles.secondaryActionPressed,
        ]}
      >
        <Text style={styles.secondaryActionText}>Ir al inicio</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  checkmark: {
    color: colors.onAccent,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
  },
  container: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.xxxl,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
  },
  metricRow: {
    gap: spacing.sm,
  },
  metricValue: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
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
  summaryCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  unknownCopy: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
});
