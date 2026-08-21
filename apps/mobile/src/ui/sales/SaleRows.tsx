import type { ProductSummary } from '@stock-app/application';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatMoneyForDisplay } from '../products/product-form-values';
import {
  calculateCartItemSubtotal,
  isCartItemStockInsufficient,
  type SaleCartItem,
} from './sale-cart';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface SaleProductRowProps {
  readonly currency: string;
  readonly onAdd: () => void;
  readonly summary: ProductSummary;
}

export function SaleProductRow({
  currency,
  onAdd,
  summary: { product, state },
}: SaleProductRowProps) {
  return (
    <Pressable
      accessibilityHint="Agrega el producto a la venta"
      accessibilityLabel={`Agregar ${product.name}`}
      accessibilityRole="button"
      onPress={onAdd}
      style={({ pressed }) => [
        styles.productRow,
        pressed && styles.productRowPressed,
      ]}
    >
      <View style={styles.productCopy}>
        <Text style={styles.productName}>{product.name}</Text>
        {product.variant ? (
          <Text style={styles.productVariant}>{product.variant}</Text>
        ) : null}
        <Text style={styles.stockText}>Stock: {state.stock}</Text>
      </View>
      <Text style={styles.productPrice}>
        {formatMoneyForDisplay(product.regularSalePrice, currency)}
      </Text>
    </Pressable>
  );
}

interface SaleCartItemRowProps {
  readonly currency: string;
  readonly item: SaleCartItem;
  readonly onDecrement: () => void;
  readonly onIncrement: () => void;
  readonly onPriceChange: (value: string) => void;
  readonly onRemove: () => void;
}

export function SaleCartItemRow({
  currency,
  item,
  onDecrement,
  onIncrement,
  onPriceChange,
  onRemove,
}: SaleCartItemRowProps) {
  const stockIsInsufficient = isCartItemStockInsufficient(item);

  return (
    <View style={styles.cartItem}>
      <View style={styles.cartItemHeader}>
        <View style={styles.productCopy}>
          <Text style={styles.cartItemName}>{item.name}</Text>
          {item.variant ? (
            <Text style={styles.productVariant}>{item.variant}</Text>
          ) : null}
          <Text style={styles.stockText}>
            Disponible: {item.availableStock}
          </Text>
        </View>
        <Text style={styles.cartSubtotal}>
          {formatMoneyForDisplay(calculateCartItemSubtotal(item), currency)}
        </Text>
      </View>

      <View style={styles.quantityRow}>
        <Pressable
          accessibilityLabel={`Reducir cantidad de ${item.name}`}
          accessibilityRole="button"
          onPress={onDecrement}
          style={({ pressed }) => [
            styles.quantityAction,
            pressed && styles.quantityActionPressed,
          ]}
        >
          <Text style={styles.quantityActionText}>−</Text>
        </Pressable>
        <Text
          accessibilityLabel={`${item.quantity} unidades`}
          style={styles.quantity}
        >
          {item.quantity}
        </Text>
        <Pressable
          accessibilityLabel={`Aumentar cantidad de ${item.name}`}
          accessibilityRole="button"
          onPress={onIncrement}
          style={({ pressed }) => [
            styles.quantityAction,
            pressed && styles.quantityActionPressed,
          ]}
        >
          <Text style={styles.quantityActionText}>+</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Eliminar ${item.name} de la venta`}
          accessibilityRole="button"
          onPress={onRemove}
          style={({ pressed }) => [
            styles.removeAction,
            pressed && styles.removeActionPressed,
          ]}
        >
          <Text style={styles.removeActionText}>Eliminar</Text>
        </Pressable>
      </View>

      <View style={styles.priceEdit}>
        <Text style={styles.fieldLabel}>Precio unitario</Text>
        <TextInput
          accessibilityLabel={`Precio unitario de ${item.name}`}
          autoCorrect={false}
          keyboardType="decimal-pad"
          onChangeText={onPriceChange}
          selectionColor={colors.accent}
          style={[styles.priceInput, item.priceError && styles.inputError]}
          value={item.unitSalePriceText}
        />
        {item.priceError ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {item.priceError}
          </Text>
        ) : null}
      </View>

      {stockIsInsufficient ? (
        <View accessibilityLiveRegion="polite" style={styles.stockWarning}>
          <Text style={styles.stockWarningTitle}>Stock insuficiente</Text>
          <Text style={styles.stockWarningText}>
            Puedes continuar preparando la venta. No se bloqueará por stock.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cartItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  cartItemHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  cartItemName: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  cartSubtotal: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.semibold,
  },
  inputError: {
    borderColor: colors.danger,
  },
  priceEdit: {
    gap: spacing.xs,
  },
  priceInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.size.body,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  productCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  productName: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  productPrice: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  productRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 84,
    padding: spacing.lg,
  },
  productRowPressed: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  productVariant: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  quantity: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
    minWidth: 32,
    textAlign: 'center',
  },
  quantityAction: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  quantityActionPressed: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  quantityActionText: {
    color: colors.accent,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
  },
  quantityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  removeAction: {
    alignItems: 'center',
    borderRadius: radii.sm,
    justifyContent: 'center',
    marginLeft: 'auto',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  removeActionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  removeActionText: {
    color: colors.danger,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  stockText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  stockWarning: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.danger,
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  stockWarningText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  stockWarningTitle: {
    color: colors.danger,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
});
