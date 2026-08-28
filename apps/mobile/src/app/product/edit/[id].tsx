import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ProductManagementUnavailableError } from '@stock-app/application';

import { Screen } from '@/ui/components/Screen';
import { ProductFormField } from '@/ui/products/ProductFormField';
import {
  createInitialProductEditValues,
  getProductEditContentKind,
  type ProductEditState,
} from '@/ui/products/product-edit-presentation';
import {
  parseEditableProductFormValues,
  type EditableProductFormValues,
} from '@/ui/products/product-form-values';
import {
  createProductDetailsRequest,
  normalizeProductIdParam,
} from '@/ui/products/product-details-presentation';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

export default function EditProductScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const productId = normalizeProductIdParam(params.id);
  const { inventory, persistence, productServices } = useAppRuntime();
  const requestIdRef = useRef(0);
  const submittingRef = useRef(false);
  const [state, setState] = useState<ProductEditState>({ status: 'loading' });
  const [values, setValues] = useState<EditableProductFormValues | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadProduct = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (productServices === null || productId === null) {
      setValues(null);
      setState({ status: 'ready', details: null });
      return;
    }

    setState({ status: 'loading' });

    try {
      const details = await productServices.getProductDetails.execute(
        createProductDetailsRequest(inventory.id, productId),
      );

      if (requestIdRef.current === requestId) {
        setValues(
          details === null ? null : createInitialProductEditValues(details),
        );
        setState({ status: 'ready', details });
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setState({ status: 'error' });
      }
    }
  }, [inventory.id, productId, productServices]);

  useFocusEffect(
    useCallback(() => {
      void loadProduct();

      return () => {
        requestIdRef.current += 1;
      };
    }, [loadProduct]),
  );

  function updateValue<Key extends keyof EditableProductFormValues>(
    key: Key,
    value: EditableProductFormValues[Key],
  ) {
    setValues((current) =>
      current === null ? current : { ...current, [key]: value },
    );
  }

  async function handleSubmit() {
    if (
      submittingRef.current ||
      values === null ||
      productServices === null ||
      productId === null
    ) {
      return;
    }

    const parsed = parseEditableProductFormValues(values);

    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }

    setErrorMessage(null);
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      await productServices.updateProduct.execute({
        inventoryId: inventory.id,
        productId,
        ...parsed.input,
      });
      router.back();
    } catch (error) {
      if (error instanceof ProductManagementUnavailableError) {
        setValues(null);
        setState({ status: 'ready', details: null });
      } else {
        setErrorMessage(
          error instanceof TypeError || error instanceof RangeError
            ? 'Revisa los datos del producto antes de guardar.'
            : 'No pudimos guardar los cambios. Intenta nuevamente.',
        );
      }
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  const contentKind = getProductEditContentKind(state);

  return (
    <Screen edges={['bottom']}>
      {persistence === 'web-preview' ? (
        <View style={styles.previewNotice}>
          <Text style={styles.previewText}>
            La vista web no guarda cambios. Abre StockApp en Expo Go para editar
            productos.
          </Text>
        </View>
      ) : null}

      {contentKind === 'loading' ? (
        <View accessibilityLiveRegion="polite" style={styles.status}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.statusText}>Cargando producto…</Text>
        </View>
      ) : null}

      {contentKind === 'not-found' ? (
        <StatusMessage
          message="Producto no disponible"
          supportingText="No se puede editar este producto desde el inventario activo."
          onBack={() => router.back()}
        />
      ) : null}

      {contentKind === 'error' ? (
        <StatusMessage
          message="No pudimos cargar el producto"
          supportingText="Inténtalo nuevamente. Tus datos no fueron modificados."
          onBack={() => router.back()}
          onRetry={() => void loadProduct()}
        />
      ) : null}

      {contentKind === 'loaded' && values !== null ? (
        <View style={styles.form}>
          <Text style={styles.supportingText}>
            Edita únicamente la información del producto. El stock y el costo se
            mantienen mediante ventas, compras y ajustes.
          </Text>

          <ProductFormField
            inputProps={{
              autoCapitalize: 'words',
              autoCorrect: false,
              editable: !isSubmitting,
              onChangeText: (value) => updateValue('name', value),
              returnKeyType: 'next',
              value: values.name,
            }}
            label="Nombre *"
          />

          <ProductFormField
            inputProps={{
              autoCapitalize: 'sentences',
              autoCorrect: false,
              editable: !isSubmitting,
              onChangeText: (value) => updateValue('variant', value),
              placeholder: '500 ml, Rojo / M',
              returnKeyType: 'next',
              value: values.variant,
            }}
            label="Variante"
            optional
          />

          <ProductFormField
            hint="Se guarda como texto para conservar ceros iniciales."
            inputProps={{
              autoCapitalize: 'none',
              autoCorrect: false,
              editable: !isSubmitting,
              onChangeText: (value) => updateValue('barcode', value),
              placeholder: '0012345',
              returnKeyType: 'next',
              value: values.barcode,
            }}
            label="Código"
            optional
          />

          <ProductFormField
            inputProps={{
              editable: !isSubmitting,
              keyboardType: 'decimal-pad',
              onChangeText: (value) => updateValue('regularSalePrice', value),
              returnKeyType: 'next',
              value: values.regularSalePrice,
            }}
            label={`Precio habitual (${inventory.currency}) *`}
          />

          <ProductFormField
            hint="Déjalo vacío si no deseas configurar un mínimo."
            inputProps={{
              editable: !isSubmitting,
              keyboardType: 'number-pad',
              onChangeText: (value) => updateValue('minimumStock', value),
              placeholder: 'Opcional',
              returnKeyType: 'done',
              value: values.minimumStock,
            }}
            label="Stock mínimo"
            optional
          />

          {errorMessage ? (
            <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
              {errorMessage}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
            disabled={isSubmitting}
            onPress={() => void handleSubmit()}
            style={({ pressed }) => [
              styles.submitAction,
              pressed && !isSubmitting && styles.submitActionPressed,
              isSubmitting && styles.submitActionDisabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.submitActionText}>Guardar cambios</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

interface StatusMessageProps {
  readonly message: string;
  readonly supportingText: string;
  readonly onBack: () => void;
  readonly onRetry?: () => void;
}

function StatusMessage({
  message,
  supportingText,
  onBack,
  onRetry,
}: StatusMessageProps) {
  return (
    <View style={styles.status}>
      <Text accessibilityRole="header" style={styles.statusTitle}>
        {message}
      </Text>
      <Text accessibilityLiveRegion="assertive" style={styles.statusText}>
        {supportingText}
      </Text>
      <View style={styles.statusActions}>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryAction,
              pressed && styles.retryActionPressed,
            ]}
          >
            <Text style={styles.retryActionText}>Reintentar</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backAction,
            pressed && styles.backActionPressed,
          ]}
        >
          <Text style={styles.backActionText}>Volver</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backAction: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backActionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  backActionText: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  form: {
    gap: spacing.lg,
    maxWidth: 560,
    width: '100%',
  },
  previewNotice: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  previewText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  retryAction: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  retryActionPressed: {
    backgroundColor: colors.accentPressed,
  },
  retryActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  status: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 240,
  },
  statusActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
    maxWidth: 420,
    textAlign: 'center',
  },
  statusTitle: {
    color: colors.text,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  submitAction: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  submitActionDisabled: {
    opacity: 0.58,
  },
  submitActionPressed: {
    backgroundColor: colors.accentPressed,
  },
  submitActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  supportingText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
  },
});
