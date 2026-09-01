import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ProductSummary } from '@stock-app/application';
import type { Sale } from '@stock-app/domain';

import { EmptyState } from '@/ui/components/EmptyState';
import { createSaleBarcodeScannerRoute } from '@/ui/barcode/barcode-scanner-presentation';
import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import { formatMoneyForDisplay } from '@/ui/products/product-form-values';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { InsufficientStockModal } from '@/ui/sales/InsufficientStockModal';
import { SaleConfirmation } from '@/ui/sales/SaleConfirmation';
import { SaleCartItemRow, SaleProductRow } from '@/ui/sales/SaleRows';
import {
  addProductToCart,
  calculateCartTotal,
  createRegisterSaleLines,
  decrementCartItem,
  filterSaleProducts,
  getCartSummary,
  getInsufficientCartItems,
  incrementCartItem,
  isCartReadyToRegister,
  removeCartItem,
  type SaleCartItem,
  updateCartItemPrice,
} from '@/ui/sales/sale-cart';
import {
  createSaleScanResultGate,
  getSaleScannerActionPresentation,
  normalizeSaleScanResult,
  resolveSaleScanProduct,
} from '@/ui/sales/sale-barcode-scanner';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

type ProductsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly products: readonly ProductSummary[] }
  | { readonly status: 'error' };

type SalePhase =
  | { readonly status: 'editing' }
  | { readonly status: 'confirmed'; readonly sale: Sale };

export default function NewSaleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    scannedProductId?: string | string[];
    scanRequestId?: string | string[];
  }>();
  const { inventory, persistence, productServices, saleServices } =
    useAppRuntime();
  const requestIdRef = useRef(0);
  const scanRequestSequenceRef = useRef(0);
  const scanResultGateRef = useRef(createSaleScanResultGate());
  const submittingRef = useRef(false);
  const [searchText, setSearchText] = useState('');
  const [cart, setCart] = useState<readonly SaleCartItem[]>([]);
  const [state, setState] = useState<ProductsState>({ status: 'loading' });
  const [phase, setPhase] = useState<SalePhase>({ status: 'editing' });
  const [warningVisible, setWarningVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const scanResult = useMemo(
    () =>
      normalizeSaleScanResult(params.scannedProductId, params.scanRequestId),
    [params.scanRequestId, params.scannedProductId],
  );
  const scannerAction = getSaleScannerActionPresentation(Platform.OS);

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

  useEffect(() => {
    if (
      phase.status !== 'editing' ||
      state.status !== 'ready' ||
      scanResult === null ||
      !scanResultGateRef.current.tryConsume(scanResult.requestId)
    ) {
      return;
    }

    const product = resolveSaleScanProduct(state.products, scanResult);

    if (product !== null) {
      setCart((currentCart) => addProductToCart(currentCart, product));
      setSearchText('');
    }

    router.setParams({
      scannedProductId: undefined,
      scanRequestId: undefined,
    });
  }, [phase.status, router, scanResult, state]);

  const visibleProducts = useMemo(
    () =>
      state.status === 'ready'
        ? filterSaleProducts(state.products, searchText)
        : [],
    [searchText, state],
  );
  const cartSummary = useMemo(() => getCartSummary(cart), [cart]);
  const cartTotal = useMemo(() => calculateCartTotal(cart), [cart]);
  const insufficientItems = useMemo(
    () => getInsufficientCartItems(cart),
    [cart],
  );
  const hasSearch = searchText.trim().length > 0;
  const hasProducts = state.status === 'ready' && state.products.length > 0;
  const canRegister =
    persistence === 'sqlite' &&
    saleServices !== null &&
    isCartReadyToRegister(cart) &&
    !isSubmitting;

  const addProduct = (product: ProductSummary) => {
    if (isSubmitting) {
      return;
    }

    setCart((currentCart) => addProductToCart(currentCart, product));
    setSearchText('');
  };

  const openBarcodeScanner = () => {
    if (!scannerAction.enabled || isSubmitting) return;

    scanRequestSequenceRef.current += 1;
    router.push(
      createSaleBarcodeScannerRoute(
        `sale-scan-${scanRequestSequenceRef.current}`,
      ),
    );
  };

  const registerCurrentCart = async () => {
    if (
      submittingRef.current ||
      saleServices === null ||
      !isCartReadyToRegister(cart)
    ) {
      return;
    }

    submittingRef.current = true;
    setWarningVisible(false);
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await saleServices.registerSale.execute({
        inventoryId: inventory.id,
        items: createRegisterSaleLines(cart),
      });

      setCart([]);
      setSearchText('');
      setPhase({ status: 'confirmed', sale: result.sale });
    } catch {
      setSubmitError(
        'No pudimos registrar la venta. Tus datos no fueron modificados.',
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const requestRegistration = () => {
    if (!canRegister) {
      return;
    }

    setSubmitError(null);

    if (insufficientItems.length > 0) {
      setWarningVisible(true);
      return;
    }

    void registerCurrentCart();
  };

  const startNewSale = () => {
    setCart([]);
    setSearchText('');
    setSubmitError(null);
    setWarningVisible(false);
    setPhase({ status: 'editing' });
    void loadProducts();
  };

  if (phase.status === 'confirmed') {
    return (
      <Screen edges={['bottom']}>
        <SaleConfirmation
          currency={inventory.currency}
          onGoHome={() => router.replace('/')}
          onNewSale={startNewSale}
          sale={phase.sale}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <View
        pointerEvents={isSubmitting ? 'none' : 'auto'}
        style={[styles.editingContent, isSubmitting && styles.editingDisabled]}
      >
        {persistence === 'web-preview' ? (
          <Text style={styles.previewText}>
            Vista previa web · El registro de ventas está disponible en iOS y
            Android con almacenamiento local.
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
                accessibilityHint={
                  scannerAction.enabled
                    ? 'Abre la cámara para buscar un producto por código'
                    : 'El escáner está disponible en iOS y Android'
                }
                accessibilityLabel={scannerAction.label}
                accessibilityRole="button"
                accessibilityState={{ disabled: !scannerAction.enabled }}
                disabled={!scannerAction.enabled}
                onPress={openBarcodeScanner}
                style={({ pressed }) => [
                  styles.scannerAction,
                  !scannerAction.enabled && styles.scannerActionDisabled,
                  pressed &&
                    scannerAction.enabled &&
                    styles.scannerActionPressed,
                ]}
              >
                <Text style={styles.scannerActionText}>
                  {scannerAction.label}
                </Text>
                {scannerAction.status === null ? null : (
                  <Text style={styles.scannerStatus}>
                    {scannerAction.status}
                  </Text>
                )}
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
                          updateCartItemPrice(
                            currentCart,
                            item.productId,
                            value,
                          ),
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
                  accessibilityHint="Guarda la venta y actualiza el stock"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canRegister }}
                  disabled={!canRegister}
                  onPress={requestRegistration}
                  style={({ pressed }) => [
                    styles.registerAction,
                    !canRegister && styles.registerActionDisabled,
                    pressed && canRegister && styles.registerActionPressed,
                  ]}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : null}
                  <Text
                    style={[
                      styles.registerActionText,
                      !canRegister && styles.registerActionTextDisabled,
                    ]}
                  >
                    {isSubmitting ? 'Registrando…' : 'Registrar venta'}
                  </Text>
                </Pressable>
                {submitError ? (
                  <Text
                    accessibilityLiveRegion="assertive"
                    style={styles.registerErrorText}
                  >
                    {submitError}
                  </Text>
                ) : null}
              </Section>
            )}
          </>
        ) : null}
      </View>

      <InsufficientStockModal
        items={insufficientItems}
        onContinue={() => void registerCurrentCart()}
        onReview={() => setWarningVisible(false)}
        visible={warningVisible}
      />
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
  editingContent: {
    gap: spacing.xl,
  },
  editingDisabled: {
    opacity: 0.72,
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
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  registerActionDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    opacity: 0.72,
  },
  registerActionPressed: {
    backgroundColor: colors.accentPressed,
  },
  registerErrorText: {
    color: colors.danger,
    fontSize: typography.size.caption,
    lineHeight: 18,
    textAlign: 'center',
  },
  registerActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  registerActionTextDisabled: {
    color: colors.textSecondary,
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  scannerActionDisabled: {
    opacity: 0.68,
  },
  scannerActionPressed: {
    backgroundColor: colors.accentSoft,
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
