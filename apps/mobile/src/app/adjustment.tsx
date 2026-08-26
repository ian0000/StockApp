import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  NoStockAdjustmentNeededError,
  type AdjustStockResult,
  type ProductSummary,
} from '@stock-app/application';
import type { AdjustmentCostMode, AdjustmentReason } from '@stock-app/domain';

import { EmptyState } from '@/ui/components/EmptyState';
import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import {
  adjustmentReasonLabel,
  evaluateAdjustmentForm,
  formatSignedDifference,
  getAdjustmentReasonOptions,
  getDefaultAdjustmentCostMode,
  normalizeReasonForDifference,
} from '@/ui/adjustments/stock-adjustment-form';
import { formatMoneyForDisplay } from '@/ui/products/product-form-values';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { filterSaleProducts } from '@/ui/sales/sale-cart';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

type ProductsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly products: readonly ProductSummary[] }
  | { readonly status: 'error' };

type AdjustmentPhase =
  | { readonly status: 'editing' }
  | {
      readonly status: 'confirmed';
      readonly result: AdjustStockResult;
      readonly productName: string;
      readonly productVariant: string | null;
    };

export default function StockAdjustmentScreen() {
  const router = useRouter();
  const { adjustmentServices, inventory, persistence, productServices } =
    useAppRuntime();
  const requestIdRef = useRef(0);
  const submittingRef = useRef(false);
  const [productsState, setProductsState] = useState<ProductsState>({
    status: 'loading',
  });
  const [phase, setPhase] = useState<AdjustmentPhase>({ status: 'editing' });
  const [searchText, setSearchText] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [actualStockText, setActualStockText] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('COUNT_CORRECTION');
  const [costMode, setCostMode] = useState<AdjustmentCostMode>('CUSTOM_COST');
  const [customUnitCostText, setCustomUnitCostText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (productServices === null) {
      setProductsState({ status: 'ready', products: [] });
      return;
    }

    setProductsState({ status: 'loading' });

    try {
      const products = await productServices.listProducts.execute({
        inventoryId: inventory.id,
      });

      if (requestIdRef.current === requestId) {
        setProductsState({ status: 'ready', products });
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setProductsState({ status: 'error' });
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

  const selectedProduct =
    productsState.status === 'ready' && selectedProductId !== null
      ? (productsState.products.find(
          ({ product }) => product.id === selectedProductId,
        ) ?? null)
      : null;
  const visibleProducts = useMemo(
    () =>
      productsState.status === 'ready'
        ? filterSaleProducts(productsState.products, searchText)
        : [],
    [productsState, searchText],
  );
  const evaluation = useMemo(
    () =>
      evaluateAdjustmentForm({
        hasSelectedProduct: selectedProduct !== null,
        currentStock: selectedProduct?.state.stock ?? 0,
        currentUnitCost: selectedProduct?.state.unitCost ?? null,
        actualStockText,
        reason,
        costMode,
        customUnitCostText,
        isSubmitting,
        canPersist: persistence === 'sqlite' && adjustmentServices !== null,
      }),
    [
      actualStockText,
      adjustmentServices,
      costMode,
      customUnitCostText,
      isSubmitting,
      persistence,
      reason,
      selectedProduct,
    ],
  );
  const reasonOptions = getAdjustmentReasonOptions(evaluation.difference);

  useEffect(() => {
    setReason((current) =>
      normalizeReasonForDifference(current, evaluation.difference),
    );
  }, [evaluation.difference]);

  useEffect(() => {
    if (selectedProduct?.state.unitCost === null) {
      setCostMode('CUSTOM_COST');
    }
  }, [selectedProduct?.state.unitCost]);

  const selectProduct = (summary: ProductSummary) => {
    if (isSubmitting) return;

    setSelectedProductId(summary.product.id);
    setSearchText('');
    setActualStockText('');
    setReason('COUNT_CORRECTION');
    setCostMode(getDefaultAdjustmentCostMode(summary.state.unitCost));
    setCustomUnitCostText('');
    setSubmitError(null);
  };

  const clearSelection = () => {
    if (isSubmitting) return;

    setSelectedProductId(null);
    setActualStockText('');
    setReason('COUNT_CORRECTION');
    setCustomUnitCostText('');
    setSubmitError(null);
  };

  const submit = async () => {
    if (
      submittingRef.current ||
      selectedProduct === null ||
      adjustmentServices === null ||
      !evaluation.canSubmit ||
      evaluation.actualStock === null ||
      evaluation.difference === null
    ) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const isPositive = evaluation.difference > 0;
      const result = await adjustmentServices.adjustStock.execute({
        inventoryId: inventory.id,
        productId: selectedProduct.product.id,
        actualStock: evaluation.actualStock,
        reason,
        costMode: isPositive ? costMode : null,
        customUnitCost:
          isPositive && costMode === 'CUSTOM_COST'
            ? evaluation.customUnitCost
            : null,
      });

      setPhase({
        status: 'confirmed',
        result,
        productName: selectedProduct.product.name,
        productVariant: selectedProduct.product.variant,
      });
    } catch (error) {
      if (error instanceof NoStockAdjustmentNeededError) {
        setSubmitError('El stock ya coincide con la cantidad registrada.');
        await loadProducts();
      } else {
        setSubmitError(
          'No pudimos guardar el ajuste. Tus datos no fueron modificados.',
        );
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const startAnotherAdjustment = () => {
    setPhase({ status: 'editing' });
    clearSelection();
    void loadProducts();
  };

  if (phase.status === 'confirmed') {
    const { adjustment, resultingState } = phase.result;
    const isPositive = adjustment.difference > 0;

    return (
      <Screen edges={['bottom']}>
        <View style={styles.confirmationHeader}>
          <Text accessibilityRole="header" style={styles.confirmationTitle}>
            ✓ Stock actualizado
          </Text>
          <Text style={styles.productName}>{phase.productName}</Text>
          {phase.productVariant ? (
            <Text style={styles.secondaryText}>{phase.productVariant}</Text>
          ) : null}
        </View>

        <Section title="Resumen">
          <SummaryRow
            label="Stock"
            value={`${adjustment.stockBefore} → ${adjustment.actualStock}`}
          />
          <SummaryRow
            label="Diferencia"
            value={formatSignedDifference(adjustment.difference)}
          />
          <SummaryRow
            label="Motivo"
            value={adjustmentReasonLabel(adjustment.reason)}
          />
          {isPositive && resultingState.unitCost !== null ? (
            <SummaryRow
              label="Costo actual"
              value={formatMoneyForDisplay(
                resultingState.unitCost,
                inventory.currency,
              )}
            />
          ) : null}
        </Section>

        <Pressable
          accessibilityRole="button"
          onPress={startAnotherAdjustment}
          style={({ pressed }) => [
            styles.primaryAction,
            pressed && styles.primaryActionPressed,
          ]}
        >
          <Text style={styles.primaryActionText}>Ajustar otro producto</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/products')}
          style={({ pressed }) => [
            styles.secondaryAction,
            pressed && styles.secondaryActionPressed,
          ]}
        >
          <Text style={styles.secondaryActionText}>Ir a productos</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <View
        pointerEvents={isSubmitting ? 'none' : 'auto'}
        style={[styles.form, isSubmitting && styles.disabledContent]}
      >
        {persistence === 'web-preview' ? (
          <Text style={styles.previewText}>
            Vista previa web · Los ajustes se guardan únicamente en iOS y
            Android.
          </Text>
        ) : null}

        {selectedProduct === null ? (
          <ProductSelector
            currency={inventory.currency}
            isLoading={productsState.status === 'loading'}
            loadError={productsState.status === 'error'}
            onRetry={() => void loadProducts()}
            onSearchChange={setSearchText}
            onSelect={selectProduct}
            products={visibleProducts}
            searchText={searchText}
            totalProducts={
              productsState.status === 'ready'
                ? productsState.products.length
                : null
            }
          />
        ) : (
          <>
            <Section title="Producto">
              <View style={styles.selectedHeader}>
                <View style={styles.selectedCopy}>
                  <Text style={styles.productName}>
                    {selectedProduct.product.name}
                  </Text>
                  {selectedProduct.product.variant ? (
                    <Text style={styles.secondaryText}>
                      {selectedProduct.product.variant}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={clearSelection}
                  style={({ pressed }) => [
                    styles.textAction,
                    pressed && styles.textActionPressed,
                  ]}
                >
                  <Text style={styles.textActionLabel}>Cambiar</Text>
                </Pressable>
              </View>
              <SummaryRow
                label="Stock registrado"
                value={String(selectedProduct.state.stock)}
              />
              <SummaryRow
                label="Costo actual"
                value={
                  selectedProduct.state.unitCost === null
                    ? '—'
                    : formatMoneyForDisplay(
                        selectedProduct.state.unitCost,
                        inventory.currency,
                      )
                }
              />
            </Section>

            <Section title="Conteo físico">
              <Text style={styles.fieldLabel}>¿Cuántas tienes realmente?</Text>
              <TextInput
                accessibilityLabel="Cantidad física real"
                editable={!isSubmitting}
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={(value) => {
                  setActualStockText(value);
                  setSubmitError(null);
                }}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                selectionColor={colors.accent}
                style={styles.input}
                value={actualStockText}
              />
              {evaluation.actualStockError ? (
                <Text style={styles.errorText}>
                  {evaluation.actualStockError}
                </Text>
              ) : null}
              {evaluation.difference !== null ? (
                <View style={styles.differenceCard}>
                  <Text style={styles.secondaryText}>Diferencia</Text>
                  <Text style={styles.differenceValue}>
                    {formatSignedDifference(evaluation.difference)}
                  </Text>
                  {evaluation.isNoOp ? (
                    <Text style={styles.noOpText}>
                      El stock ya coincide. No necesitas hacer ningún ajuste.
                    </Text>
                  ) : evaluation.difference > 0 ? (
                    <Text style={styles.secondaryText}>
                      Se agregarán {evaluation.difference} unidades al
                      inventario.
                    </Text>
                  ) : (
                    <Text style={styles.secondaryText}>
                      Se retirarán {Math.abs(evaluation.difference)} unidades
                      del inventario.
                    </Text>
                  )}
                </View>
              ) : null}
            </Section>

            {evaluation.difference !== null && evaluation.difference !== 0 ? (
              <Section title="Motivo">
                <View accessibilityRole="radiogroup" style={styles.options}>
                  {reasonOptions.map((option) => (
                    <Choice
                      key={option.value}
                      label={option.label}
                      onPress={() => setReason(option.value)}
                      selected={reason === option.value}
                    />
                  ))}
                </View>
              </Section>
            ) : null}

            {evaluation.difference !== null && evaluation.difference > 0 ? (
              <Section title="Costo de las unidades agregadas">
                {selectedProduct.state.unitCost === null ? (
                  <Text style={styles.infoText}>
                    Este producto aún no tiene un costo conocido. Ingresa el
                    costo de estas unidades.
                  </Text>
                ) : (
                  <Choice
                    label={`Usar costo actual — ${formatMoneyForDisplay(
                      selectedProduct.state.unitCost,
                      inventory.currency,
                    )}`}
                    onPress={() => setCostMode('USE_CURRENT_COST')}
                    selected={costMode === 'USE_CURRENT_COST'}
                    supportingText="Recomendado"
                  />
                )}
                <Choice
                  label="Usar otro costo"
                  onPress={() => setCostMode('CUSTOM_COST')}
                  selected={costMode === 'CUSTOM_COST'}
                />
                {costMode === 'CUSTOM_COST' ? (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Costo unitario</Text>
                    <TextInput
                      accessibilityLabel="Costo unitario de las unidades agregadas"
                      editable={!isSubmitting}
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      onChangeText={(value) => {
                        setCustomUnitCostText(value);
                        setSubmitError(null);
                      }}
                      placeholder="0.00"
                      placeholderTextColor={colors.textSecondary}
                      selectionColor={colors.accent}
                      style={styles.input}
                      value={customUnitCostText}
                    />
                    {evaluation.costError ? (
                      <Text style={styles.errorText}>
                        {evaluation.costError}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </Section>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !evaluation.canSubmit }}
              disabled={!evaluation.canSubmit}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.primaryAction,
                !evaluation.canSubmit && styles.primaryActionDisabled,
                pressed && evaluation.canSubmit && styles.primaryActionPressed,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : null}
              <Text
                style={[
                  styles.primaryActionText,
                  !evaluation.canSubmit && styles.primaryActionTextDisabled,
                ]}
              >
                {isSubmitting ? 'Guardando…' : 'Guardar ajuste'}
              </Text>
            </Pressable>
            {submitError ? (
              <Text
                accessibilityLiveRegion="assertive"
                style={styles.errorText}
              >
                {submitError}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}

interface ProductSelectorProps {
  readonly currency: string;
  readonly isLoading: boolean;
  readonly loadError: boolean;
  readonly onRetry: () => void;
  readonly onSearchChange: (value: string) => void;
  readonly onSelect: (summary: ProductSummary) => void;
  readonly products: readonly ProductSummary[];
  readonly searchText: string;
  readonly totalProducts: number | null;
}

function ProductSelector({
  currency,
  isLoading,
  loadError,
  onRetry,
  onSearchChange,
  onSelect,
  products,
  searchText,
  totalProducts,
}: ProductSelectorProps) {
  if (isLoading) {
    return (
      <View style={styles.status}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.secondaryText}>Cargando productos…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.status}>
        <Text style={styles.errorText}>No pudimos cargar tus productos.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={styles.secondaryAction}
        >
          <Text style={styles.secondaryActionText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  if (totalProducts === 0) {
    return (
      <EmptyState
        message="Aún no tienes productos."
        supportingText="Crea un producto antes de ajustar su stock."
      />
    );
  }

  return (
    <Section title="Selecciona un producto">
      <TextInput
        accessibilityLabel="Buscar producto para ajustar"
        autoCorrect={false}
        onChangeText={onSearchChange}
        placeholder="Buscar por nombre, variante o código"
        placeholderTextColor={colors.textSecondary}
        returnKeyType="search"
        selectionColor={colors.accent}
        style={styles.input}
        value={searchText}
      />
      {products.length === 0 ? (
        <EmptyState
          message="No encontramos productos"
          supportingText="Prueba con otro nombre, variante o código completo."
        />
      ) : (
        <View accessibilityRole="list" style={styles.productList}>
          {products.map((summary) => (
            <Pressable
              accessibilityLabel={`Ajustar ${summary.product.name}`}
              accessibilityRole="button"
              key={summary.product.id}
              onPress={() => onSelect(summary)}
              style={({ pressed }) => [
                styles.productRow,
                pressed && styles.productRowPressed,
              ]}
            >
              <View style={styles.selectedCopy}>
                <Text style={styles.productName}>{summary.product.name}</Text>
                {summary.product.variant ? (
                  <Text style={styles.secondaryText}>
                    {summary.product.variant}
                  </Text>
                ) : null}
                <Text style={styles.secondaryText}>
                  {summary.state.stock} unidades
                </Text>
              </View>
              <Text style={styles.costText}>
                {summary.state.unitCost === null
                  ? 'Costo —'
                  : formatMoneyForDisplay(summary.state.unitCost, currency)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Section>
  );
}

interface ChoiceProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
  readonly supportingText?: string;
}

function Choice({ label, onPress, selected, supportingText }: ChoiceProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        pressed && styles.choicePressed,
      ]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]} />
      <View style={styles.selectedCopy}>
        <Text style={styles.choiceLabel}>{label}</Text>
        {supportingText ? (
          <Text style={styles.supportingText}>{supportingText}</Text>
        ) : null}
      </View>
    </Pressable>
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
      <Text style={styles.secondaryText}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  choice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 52,
    padding: spacing.md,
  },
  choiceLabel: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  choicePressed: { backgroundColor: colors.accentSoft },
  choiceSelected: { borderColor: colors.accent },
  confirmationHeader: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  confirmationTitle: {
    color: colors.accent,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  costText: {
    color: colors.text,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.semibold,
  },
  differenceCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  differenceValue: {
    color: colors.text,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
  },
  disabledContent: { opacity: 0.72 },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.caption,
    lineHeight: 18,
    textAlign: 'center',
  },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  form: { gap: spacing.xl },
  infoText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
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
    paddingVertical: spacing.md,
  },
  noOpText: {
    color: colors.accent,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.semibold,
  },
  options: { gap: spacing.sm },
  previewText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    padding: spacing.md,
  },
  primaryActionDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
  },
  primaryActionPressed: { backgroundColor: colors.accentPressed },
  primaryActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  primaryActionTextDisabled: { color: colors.textSecondary },
  productList: { gap: spacing.sm },
  productName: {
    color: colors.text,
    fontSize: typography.size.section,
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
    minHeight: 80,
    padding: spacing.md,
  },
  productRowPressed: { backgroundColor: colors.accentSoft },
  radio: {
    borderColor: colors.textSecondary,
    borderRadius: 8,
    borderWidth: 2,
    height: 16,
    width: 16,
  },
  radioSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  secondaryAction: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    padding: spacing.md,
  },
  secondaryActionPressed: { backgroundColor: colors.accentSoft },
  secondaryActionText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  selectedCopy: { flex: 1, gap: spacing.xs },
  selectedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  status: {
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 180,
    justifyContent: 'center',
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  summaryValue: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
    textAlign: 'right',
  },
  supportingText: { color: colors.accent, fontSize: typography.size.caption },
  textAction: {
    borderRadius: radii.sm,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  textActionLabel: {
    color: colors.accent,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  textActionPressed: { backgroundColor: colors.accentSoft },
});
