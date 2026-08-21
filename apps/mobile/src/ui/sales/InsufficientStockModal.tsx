import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { SaleCartItem } from './sale-cart';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface InsufficientStockModalProps {
  readonly items: readonly SaleCartItem[];
  readonly onContinue: () => void;
  readonly onReview: () => void;
  readonly visible: boolean;
}

export function InsufficientStockModal({
  items,
  onContinue,
  onReview,
  visible,
}: InsufficientStockModalProps) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onReview}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.handle} />
          <Text accessibilityRole="header" style={styles.title}>
            Stock insuficiente
          </Text>
          <Text style={styles.description}>
            Hay productos con una cantidad mayor al stock registrado.
          </Text>

          <View accessibilityRole="list" style={styles.itemList}>
            {items.map((item) => (
              <View
                accessibilityRole="summary"
                key={item.productId}
                style={styles.itemRow}
              >
                <View style={styles.itemCopy}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {item.variant ? (
                    <Text style={styles.itemVariant}>{item.variant}</Text>
                  ) : null}
                </View>
                <View style={styles.itemQuantities}>
                  <Text style={styles.quantityText}>
                    Disponible: {item.availableStock}
                  </Text>
                  <Text style={styles.quantityText}>
                    Venta: {item.quantity}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onReview}
            style={({ pressed }) => [
              styles.reviewAction,
              pressed && styles.reviewActionPressed,
            ]}
          >
            <Text style={styles.reviewActionText}>Revisar cantidad</Text>
          </Pressable>
          <Pressable
            accessibilityHint="La venta puede dejar stock negativo"
            accessibilityRole="button"
            onPress={onContinue}
            style={({ pressed }) => [
              styles.continueAction,
              pressed && styles.continueActionPressed,
            ]}
          >
            <Text style={styles.continueActionText}>Registrar igualmente</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  continueAction: {
    alignItems: 'center',
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  continueActionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  continueActionText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radii.sm,
    height: 4,
    width: 48,
  },
  itemCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  itemList: {
    gap: spacing.sm,
  },
  itemName: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  itemQuantities: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  itemRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  itemVariant: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  overlay: {
    backgroundColor: 'rgba(25, 34, 28, 0.42)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  quantityText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  reviewAction: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  reviewActionPressed: {
    backgroundColor: colors.accentPressed,
  },
  reviewActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.lg,
    maxHeight: '88%',
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
  },
});
