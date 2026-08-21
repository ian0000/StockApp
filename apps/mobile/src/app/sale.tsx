import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ProductSummary } from '@stock-app/application';

import { EmptyState } from '@/ui/components/EmptyState';
import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import { formatMoneyForDisplay } from '@/ui/products/product-form-values';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { SaleCartItemRow, SaleProductRow } from '@/ui/sales/SaleRows';
import {
  addProductToCart,
  calculateCartTotal,
  decrementCartItem,
  filterSaleProducts,
  getCartSummary,
  incrementCartItem,
  removeCartItem,
  type SaleCartItem,
  updateCartItemPrice,
} from '@/ui/sales/sale-cart';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

type ProductsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly products: readonly ProductSummary[] }
  | { readonly status: 'error' };

export default function NewSaleScreen() {
  const router = useRouter();
  const { inventory, persistence, productServices } = useAppRuntime();
  const requestIdRef = useRef(0);
  const [searchText, setSearchText] = useState('');
  const [cart, setCart] = useState<readonly SaleCartItem[]>([]);
  const [state, setState] = useState<ProductsState>({ status: 'loading' });

  const loadProducts = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (productServices === null) {
      setState({ status: 'ready', products: [] });
      return;
    }

    setState({ status: 'loading' });

    try {
      const products = await productServices.listProducts.execute({
        inventoryId: inventory.id,
      });

      if (requestIdRef.current === requestId) {
        setState({ status: 'ready', products });
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setState({ status: 'error' });
      }
    }
  }, [inventory.id, productServices]);

  useFocusEffect(
    useCallback(() => {
      void loadProducts();

      return () => {
        requestIdRef.current += 1;
      };
    }, [loadProducts]),
  );

  const visibleProducts = useMemo(
    () =>
      state.status === 'ready'
        ? filterSaleProducts(state.products, searchText)
        : [],
    [searchText, state],
  );
  const cartSummary = useMemo(() => getCartSummary(cart), [cart]);
  const cartTotal = useMemo(() => calculateCartTotal(cart), [cart]);
  const hasSearch = searchText.trim().length > 0;
  const hasProducts = state.status === 'ready' && state.products.length > 0;

  const addProduct = (product: ProductSummary) => {
    setCart((currentCart) => addProductToCart(currentCart, product));
    setSearchText('');
  };

  return (
    <Screen edges={['bottom']}>
      {persistence === 'web-preview' ? (
        <Text style={styles.previewText}>
          Vista previa web · Tus productos locales están disponibles en iOS y
          Android.
        </Text>
      ) : null}

      {state.status === 'loading' ? (
        <View style={styles.status}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.statusText}>Cargando productos…</Text>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View style={styles.status}>
          <Text
            accessibilityLiveRegion="assertive"
            style={styles.loadErrorText}
          >
            No pudimos cargar tus productos.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadProducts()}
            style={({ pressed }) => [
              styles.retryAction,
              pressed && styles.retryActionPressed,
            ]}
          >
            <Text style={styles.retryActionText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {state.status === 'ready' && state.products.length === 0 ? (
        <View style={styles.emptyInventory}>
          <EmptyState
            message="Aún no tienes productos."
            supportingText="Crea tu primer producto desde Productos para comenzar a vender."
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/products')}
            style={({ pressed }) => [
              styles.primaryAction,
              pressed && styles.primaryActionPressed,
            ]}
          >
            <Text style={styles.primaryActionText}>Ir a Productos</Text>
          </Pressable>
        </View>
      ) : null}

      {hasProducts ? (
        <>
          <View style={styles.searchRow}>
            <View style={styles.searchField}>
              <TextInput
                accessibilityLabel="Buscar producto"
                autoCorrect={false}
                onChangeText={setSearchText}
                placeholder="Buscar producto"
                placeholderTextColor={colors.textSecondary}
                returnKeyType="search"
                selectionColor={colors.accent}
                style={styles.searchInput}
                value={searchText}
              />

              {searchText.length > 0 ? (
                <Pressable
                  accessibilityHint="Borra el texto escrito"
                  accessibilityLabel="Limpiar búsqueda"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setSearchText('')}
                  style={({ pressed }) => [
                    styles.clearAction,
                    pressed && styles.clearActionPressed,
                  ]}
                >
                  <Text style={styles.clearActionText}>Limpiar</Text>
                </Pressable>
              ) : null}
            </View>

            <Pressable
              accessibilityHint="El escáner se habilitará en una etapa posterior"
              accessibilityLabel="Escanear código, no disponible todavía"
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              disabled
              style={styles.scannerAction}
            >
              <Text style={styles.scannerActionText}>Escanear</Text>
              <Text style={styles.scannerStatus}>Próximamente</Text>
            </Pressable>
          </View>

          <View accessibilityLiveRegion="polite">
            <Section
              title={hasSearch ? 'RESULTADOS' : 'RECIENTES'}
              titleVariant="eyebrow"
            >
              {!hasSearch ? (
                <Text style={styles.recentExplanation}>
                  Productos creados recientemente
                </Text>
              ) : null}
              {visibleProducts.length === 0 ? (
                <EmptyState
                  message="No encontramos productos"
                  supportingText="Prueba con otro nombre, variante o código completo."
                />
              ) : (
                <View accessibilityRole="list" style={styles.productList}>
                  {visibleProducts.map((product) => (
                    <SaleProductRow
                      currency={inventory.currency}
                      key={product.product.id}
                      onAdd={() => addProduct(product)}
                      summary={product}
                    />
                  ))}
                </View>
              )}
            </Section>
          </View>

          {cart.length === 0 ? (
            <View style={styles.basketEmptyState}>
              <Text style={styles.basketTitle}>Tu venta está vacía</Text>
              <Text style={styles.basketSupportingText}>
                Busca un producto para comenzar.
              </Text>
            </View>
          ) : (
            <Section title="Tu venta">
              <View style={styles.cartList}>
                {cart.map((item) => (
                  <SaleCartItemRow
                    currency={inventory.currency}
                    item={item}
                    key={item.productId}
                    onDecrement={() =>
                      setCart((currentCart) =>
                        decrementCartItem(currentCart, item.productId),
                      )
                    }
                    onIncrement={() =>
                      setCart((currentCart) =>
                        incrementCartItem(currentCart, item.productId),
                      )
                    }
                    onPriceChange={(value) =>
                      setCart((currentCart) =>
                        updateCartItemPrice(currentCart, item.productId, value),
                      )
                    }
                    onRemove={() =>
                      setCart((currentCart) =>
                        removeCartItem(currentCart, item.productId),
                      )
                    }
                  />
                ))}
              </View>

              <View style={styles.cartSummary}>
                <Text style={styles.summaryText}>
                  {cartSummary.distinctProducts}{' '}
                  {cartSummary.distinctProducts === 1
                    ? 'producto'
                    : 'productos'}
                </Text>
                <Text style={styles.summaryText}>
                  {cartSummary.totalUnits}{' '}
                  {cartSummary.totalUnits === 1 ? 'unidad' : 'unidades'}
                </Text>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>
                    {formatMoneyForDisplay(cartTotal, inventory.currency)}
                  </Text>
                </View>
              </View>

              <Pressable
                accessibilityHint="El registro real de ventas se habilitará próximamente"
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                disabled
                style={styles.registerAction}
              >
                <Text style={styles.registerActionText}>Registrar venta</Text>
              </Pressable>
              <Text style={styles.registerSupportingText}>
                La confirmación estará disponible próximamente.
              </Text>
            </Section>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  basketEmptyState: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  basketSupportingText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
    textAlign: 'center',
  },
  basketTitle: {
    color: colors.text,
    fontSize: typography.size.section,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  cartList: {
    gap: spacing.md,
  },
  cartSummary: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  clearAction: {
    alignItems: 'center',
    borderRadius: radii.sm,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  clearActionPressed: {
    backgroundColor: colors.accentSoft,
  },
  clearActionText: {
    color: colors.accent,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  emptyInventory: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  loadErrorText: {
    color: colors.danger,
    fontSize: typography.size.body,
    textAlign: 'center',
  },
  previewText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  primaryAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 48,
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
  productList: {
    gap: spacing.sm,
  },
  recentExplanation: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  registerAction: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    opacity: 0.72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  registerActionText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  registerSupportingText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    textAlign: 'center',
  },
  retryAction: {
    borderColor: colors.accent,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  retryActionPressed: {
    backgroundColor: colors.accentSoft,
  },
  retryActionText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  scannerAction: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 96,
    opacity: 0.68,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  scannerActionText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  scannerStatus: {
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  searchField: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: typography.size.body,
    minHeight: 52,
    minWidth: 0,
    paddingVertical: spacing.md,
  },
  searchRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.md,
  },
  status: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 180,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
  },
  summaryText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  totalLabel: {
    color: colors.text,
    fontSize: typography.size.section,
    fontWeight: typography.weight.bold,
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  totalValue: {
    color: colors.text,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
  },
});
