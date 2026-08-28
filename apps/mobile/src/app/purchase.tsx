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

import type {
  ProductSummary,
  RegisterPurchaseResult,
} from '@stock-app/application';

import { EmptyState } from '@/ui/components/EmptyState';
import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import { formatMoneyForDisplay } from '@/ui/products/product-form-values';
import { PurchaseConfirmation } from '@/ui/purchases/PurchaseConfirmation';
import { parsePurchaseFormValues } from '@/ui/purchases/purchase-form';
import { applySuggestedPrice } from '@/ui/purchases/purchase-price-presentation';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { filterSaleProducts } from '@/ui/sales/sale-cart';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

type ProductsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly products: readonly ProductSummary[] }
  | { readonly status: 'error' };

type PurchasePhase =
  | { readonly status: 'editing' }
  | {
      readonly status: 'confirmed';
      readonly result: RegisterPurchaseResult;
      readonly priceDecision: PriceDecisionStatus;
    };

type PriceDecisionStatus = 'pending' | 'saving' | 'applied' | 'kept' | 'error';

export default function NewPurchaseScreen() {
  const router = useRouter();
  const { inventory, persistence, productServices, purchaseServices } =
    useAppRuntime();
  const requestIdRef = useRef(0);
  const submittingRef = useRef(false);
  const updatingPriceRef = useRef(false);
  const [state, setState] = useState<ProductsState>({ status: 'loading' });
  const [phase, setPhase] = useState<PurchasePhase>({ status: 'editing' });
  const [searchText, setSearchText] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductSummary | null>(
    null,
  );
  const [quantityText, setQuantityText] = useState('');
  const [unitCostText, setUnitCostText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
  const parsedForm = useMemo(
    () =>
      parsePurchaseFormValues({
        quantity: quantityText,
        unitCost: unitCostText,
      }),
    [quantityText, unitCostText],
  );
  const projectedStock =
    selectedProduct !== null && parsedForm.ok
      ? selectedProduct.state.stock + parsedForm.quantity
      : null;
  const projectedStockIsSafe =
    projectedStock === null || Number.isSafeInteger(projectedStock);
  const canRegister =
    persistence === 'sqlite' &&
    purchaseServices !== null &&
    selectedProduct !== null &&
    parsedForm.ok &&
    projectedStockIsSafe &&
    !isSubmitting;
  const hasSearch = searchText.trim().length > 0;

  const selectProduct = (summary: ProductSummary) => {
    if (isSubmitting) return;

    setSelectedProduct(summary);
    setSearchText('');
    setQuantityText('');
    setUnitCostText('');
    setSubmitError(null);
  };

  const changeProduct = () => {
    if (isSubmitting) return;

    setSelectedProduct(null);
    setQuantityText('');
    setUnitCostText('');
    setSubmitError(null);
  };

  const registerPurchase = async () => {
    if (
      submittingRef.current ||
      purchaseServices === null ||
      selectedProduct === null ||
      !parsedForm.ok ||
      !projectedStockIsSafe
    ) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await purchaseServices.registerPurchase.execute({
        inventoryId: inventory.id,
        productId: selectedProduct.product.id,
        quantity: parsedForm.quantity,
        unitCost: parsedForm.unitCost,
      });

      setSelectedProduct(null);
      setSearchText('');
      setQuantityText('');
      setUnitCostText('');
      setPhase({ status: 'confirmed', result, priceDecision: 'pending' });
      void loadProducts();
    } catch {
      setSubmitError(
        'No pudimos registrar la compra. Tus datos no fueron modificados.',
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const keepCurrentPrice = () => {
    if (phase.status !== 'confirmed' || updatingPriceRef.current) return;

    setPhase({ ...phase, priceDecision: 'kept' });
  };

  const applySuggestedPriceChoice = async () => {
    if (
      phase.status !== 'confirmed' ||
      productServices === null ||
      updatingPriceRef.current
    ) {
      return;
    }

    const confirmedResult = phase.result;
    updatingPriceRef.current = true;
    setPhase({
      status: 'confirmed',
      result: confirmedResult,
      priceDecision: 'saving',
    });

    try {
      await applySuggestedPrice(confirmedResult, productServices.updateProduct);
      setPhase({
        status: 'confirmed',
        result: confirmedResult,
        priceDecision: 'applied',
      });
      void loadProducts();
    } catch {
      setPhase({
        status: 'confirmed',
        result: confirmedResult,
        priceDecision: 'error',
      });
    } finally {
      updatingPriceRef.current = false;
    }
  };

  const startNewPurchase = () => {
    setSelectedProduct(null);
    setSearchText('');
    setQuantityText('');
    setUnitCostText('');
    setSubmitError(null);
    setPhase({ status: 'editing' });
    void loadProducts();
  };

  if (phase.status === 'confirmed') {
    return (
      <Screen edges={['bottom']}>
        <PurchaseConfirmation
          currency={inventory.currency}
          onGoProducts={() => router.replace('/products')}
          onKeepPrice={keepCurrentPrice}
          onNewPurchase={startNewPurchase}
          onUseSuggestedPrice={() => void applySuggestedPriceChoice()}
          priceDecision={phase.priceDecision}
          result={phase.result}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <View
        pointerEvents={isSubmitting ? 'none' : 'auto'}
        style={[styles.content, isSubmitting && styles.contentDisabled]}
      >
        <Text style={styles.introduction}>
          Selecciona un producto e indica cuántas unidades recibiste y su costo
          real.
        </Text>

        {persistence === 'web-preview' ? (
          <Text style={styles.previewText}>
            Vista previa web · El registro de compras está disponible en iOS y
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
            <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
              No pudimos cargar tus productos.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadProducts()}
              style={({ pressed }) => [
                styles.retryAction,
                pressed && styles.secondaryPressed,
              ]}
            >
              <Text style={styles.retryActionText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        {state.status === 'ready' && state.products.length === 0 ? (
          <View style={styles.emptyState}>
            <EmptyState
              message="Aún no tienes productos."
              supportingText="Crea un producto antes de registrar una compra."
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/products')}
              style={({ pressed }) => [
                styles.primaryAction,
                pressed && styles.primaryPressed,
              ]}
            >
              <Text style={styles.primaryActionText}>Ir a productos</Text>
            </Pressable>
          </View>
        ) : null}

        {state.status === 'ready' &&
        state.products.length > 0 &&
        selectedProduct === null ? (
          <Section
            title={hasSearch ? 'RESULTADOS' : 'PRODUCTOS RECIENTES'}
            titleVariant="eyebrow"
          >
            <TextInput
              accessibilityLabel="Buscar producto"
              autoCorrect={false}
              onChangeText={setSearchText}
              placeholder="Buscar por nombre, variante o código"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="search"
              selectionColor={colors.accent}
              style={styles.searchInput}
              value={searchText}
            />

            {visibleProducts.length === 0 ? (
              <EmptyState
                message="No encontramos productos"
                supportingText="Prueba con otro nombre, variante o código completo."
              />
            ) : (
              <View accessibilityRole="list" style={styles.productList}>
                {visibleProducts.map((summary) => (
                  <ProductSelectionRow
                    key={summary.product.id}
                    onSelect={() => selectProduct(summary)}
                    summary={summary}
                  />
                ))}
              </View>
            )}
          </Section>
        ) : null}

        {selectedProduct !== null ? (
          <Section title="Compra">
            <View style={styles.selectedCard}>
              <View style={styles.productCopy}>
                <Text style={styles.productName}>
                  {selectedProduct.product.name}
                </Text>
                {selectedProduct.product.variant ? (
                  <Text style={styles.secondaryText}>
                    {selectedProduct.product.variant}
                  </Text>
                ) : null}
                <Text style={styles.secondaryText}>
                  Stock actual: {selectedProduct.state.stock}
                </Text>
                <Text style={styles.secondaryText}>
                  Costo actual:{' '}
                  {selectedProduct.state.unitCost === null
                    ? '—'
                    : formatMoneyForDisplay(
                        selectedProduct.state.unitCost,
                        inventory.currency,
                      )}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={changeProduct}
                style={({ pressed }) => [
                  styles.changeAction,
                  pressed && styles.secondaryPressed,
                ]}
              >
                <Text style={styles.changeActionText}>Cambiar</Text>
              </Pressable>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Cantidad</Text>
              <TextInput
                accessibilityLabel="Cantidad comprada"
                autoCorrect={false}
                keyboardType="number-pad"
                onChangeText={setQuantityText}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                selectionColor={colors.accent}
                style={[
                  styles.input,
                  quantityText.length > 0 &&
                    !parsedForm.ok &&
                    parsedForm.quantityError !== null &&
                    styles.inputError,
                ]}
                value={quantityText}
              />
              {quantityText.length > 0 &&
              !parsedForm.ok &&
              parsedForm.quantityError !== null ? (
                <Text style={styles.errorText}>{parsedForm.quantityError}</Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Costo unitario</Text>
              <TextInput
                accessibilityLabel="Costo unitario de compra"
                autoCorrect={false}
                keyboardType="decimal-pad"
                onChangeText={setUnitCostText}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                selectionColor={colors.accent}
                style={[
                  styles.input,
                  unitCostText.length > 0 &&
                    !parsedForm.ok &&
                    parsedForm.unitCostError !== null &&
                    styles.inputError,
                ]}
                value={unitCostText}
              />
              {unitCostText.length > 0 &&
              !parsedForm.ok &&
              parsedForm.unitCostError !== null ? (
                <Text style={styles.errorText}>{parsedForm.unitCostError}</Text>
              ) : null}
            </View>

            {parsedForm.ok ? (
              <View style={styles.previewCard}>
                <PreviewRow
                  label="Cantidad"
                  value={String(parsedForm.quantity)}
                />
                <PreviewRow
                  label="Costo unitario"
                  value={formatMoneyForDisplay(
                    parsedForm.unitCost,
                    inventory.currency,
                  )}
                />
                <PreviewRow
                  label="Total de compra"
                  value={formatMoneyForDisplay(
                    parsedForm.total,
                    inventory.currency,
                  )}
                />
                {projectedStockIsSafe ? (
                  <PreviewRow
                    label="Stock"
                    value={`${selectedProduct.state.stock} → ${projectedStock}`}
                  />
                ) : (
                  <Text style={styles.errorText}>
                    La cantidad produce un stock fuera del rango admitido.
                  </Text>
                )}
              </View>
            ) : null}

            <Pressable
              accessibilityHint="Guarda la compra y actualiza el inventario"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canRegister }}
              disabled={!canRegister}
              onPress={() => void registerPurchase()}
              style={({ pressed }) => [
                styles.registerAction,
                !canRegister && styles.registerDisabled,
                pressed && canRegister && styles.primaryPressed,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : null}
              <Text
                style={[
                  styles.registerText,
                  !canRegister && styles.registerTextDisabled,
                ]}
              >
                {isSubmitting ? 'Registrando…' : 'Registrar compra'}
              </Text>
            </Pressable>

            {submitError ? (
              <Text
                accessibilityLiveRegion="assertive"
                style={styles.submitError}
              >
                {submitError}
              </Text>
            ) : null}
          </Section>
        ) : null}
      </View>
    </Screen>
  );
}

function ProductSelectionRow({
  onSelect,
  summary: { product, state },
}: {
  readonly onSelect: () => void;
  readonly summary: ProductSummary;
}) {
  return (
    <Pressable
      accessibilityHint="Selecciona el producto para registrar una compra"
      accessibilityLabel={`Seleccionar ${product.name}`}
      accessibilityRole="button"
      onPress={onSelect}
      style={({ pressed }) => [
        styles.productRow,
        pressed && styles.productRowPressed,
      ]}
    >
      <View style={styles.productCopy}>
        <Text style={styles.productName}>{product.name}</Text>
        {product.variant ? (
          <Text style={styles.secondaryText}>{product.variant}</Text>
        ) : null}
        <Text style={styles.secondaryText}>Stock: {state.stock}</Text>
      </View>
      <Text style={styles.selectText}>Seleccionar</Text>
    </Pressable>
  );
}

function PreviewRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={styles.previewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  changeAction: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  changeActionText: {
    color: colors.accent,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  content: {
    gap: spacing.xl,
  },
  contentDisabled: {
    opacity: 0.72,
  },
  emptyState: {
    gap: spacing.lg,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.size.body,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputError: {
    borderColor: colors.danger,
  },
  introduction: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
  },
  previewCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    gap: spacing.md,
    padding: spacing.lg,
  },
  previewLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  previewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  previewText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  previewValue: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
    textAlign: 'right',
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
  primaryActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  primaryPressed: {
    backgroundColor: colors.accentPressed,
  },
  productCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  productList: {
    gap: spacing.sm,
  },
  productName: {
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
  registerDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    opacity: 0.72,
  },
  registerText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  registerTextDisabled: {
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
  retryActionText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.size.body,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  secondaryPressed: {
    backgroundColor: colors.accentSoft,
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  selectedCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  selectText: {
    color: colors.accent,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
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
  submitError: {
    color: colors.danger,
    fontSize: typography.size.caption,
    lineHeight: 18,
    textAlign: 'center',
  },
});
