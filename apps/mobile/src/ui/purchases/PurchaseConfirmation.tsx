import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RegisterPurchaseResult } from '@stock-app/application';

import { formatMoneyForDisplay } from '../products/product-form-values';
import { createPurchasePricePresentation } from './purchase-price-presentation';
import { formatStockTransition } from './purchase-form';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface PurchaseConfirmationProps {
  readonly currency: string;
  readonly onGoProducts: () => void;
  readonly onKeepPrice: () => void;
  readonly onNewPurchase: () => void;
  readonly onUseSuggestedPrice: () => void;
  readonly priceDecision: 'pending' | 'saving' | 'applied' | 'kept' | 'error';
  readonly result: RegisterPurchaseResult;
}

export function PurchaseConfirmation({
  currency,
  onGoProducts,
  onKeepPrice,
  onNewPurchase,
  onUseSuggestedPrice,
  priceDecision,
  result,
}: PurchaseConfirmationProps) {
  const { purchase } = result;
  const price = createPurchasePricePresentation(result, currency);
  const decisionIsOpen =
    price.hasPriceDecision &&
    (priceDecision === 'pending' ||
      priceDecision === 'saving' ||
      priceDecision === 'error');

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
        {price.costChanged ? (
          <>
            <SummaryRow
              label="Costo anterior"
              value={price.previousCostLabel}
            />
            <SummaryRow label="Costo actual" value={price.currentCostLabel} />
          </>
        ) : (
          <SummaryRow
            label="Costo promedio"
            value={formatMoneyForDisplay(purchase.averageCostAfter, currency)}
          />
        )}
      </View>

      {price.costChanged ? (
        <View style={styles.analysisCard}>
          <Text style={styles.analysisTitle}>El costo cambió</Text>
          <SummaryRow
            label={`Margen anterior con ${price.regularSalePriceLabel}`}
            value={price.previousMarginLabel}
          />
          <SummaryRow
            label="Margen actual con el mismo precio"
            value={price.currentMarginLabel}
          />
          {price.suggestedSalePriceLabel !== null ? (
            <SummaryRow
              label="Precio para conservar el margen anterior"
              value={price.suggestedSalePriceLabel}
            />
          ) : null}
        </View>
      ) : null}

      {decisionIsOpen ? (
        <View style={styles.decisionActions}>
          {priceDecision === 'error' ? (
            <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
              La compra se registró, pero no pudimos actualizar el precio.
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: priceDecision === 'saving' }}
            disabled={priceDecision === 'saving'}
            onPress={onUseSuggestedPrice}
            style={({ pressed }) => [
              styles.primaryAction,
              priceDecision === 'saving' && styles.actionDisabled,
              pressed &&
                priceDecision !== 'saving' &&
                styles.primaryActionPressed,
            ]}
          >
            <Text style={styles.primaryActionText}>
              {priceDecision === 'saving'
                ? 'Actualizando precio…'
                : priceDecision === 'error'
                  ? 'Reintentar cambio de precio'
                  : `Usar ${price.suggestedSalePriceLabel ?? ''}`}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: priceDecision === 'saving' }}
            disabled={priceDecision === 'saving'}
            onPress={onKeepPrice}
            style={({ pressed }) => [
              styles.secondaryAction,
              priceDecision === 'saving' && styles.actionDisabled,
              pressed &&
                priceDecision !== 'saving' &&
                styles.secondaryActionPressed,
            ]}
          >
            <Text style={styles.secondaryActionText}>
              Mantener {price.regularSalePriceLabel}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {priceDecision === 'applied' ? (
            <Text accessibilityLiveRegion="polite" style={styles.successText}>
              Precio habitual actualizado.
            </Text>
          ) : null}
          {priceDecision === 'kept' ? (
            <Text accessibilityLiveRegion="polite" style={styles.statusText}>
              Conservaste el precio habitual actual.
            </Text>
          ) : null}
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
        </>
      )}
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
  actionDisabled: {
    opacity: 0.65,
  },
  analysisCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.lg,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  analysisTitle: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  container: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.xl,
  },
  decisionActions: {
    alignSelf: 'stretch',
    gap: spacing.md,
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
  statusText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    textAlign: 'center',
  },
  successText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
});
