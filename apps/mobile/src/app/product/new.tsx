import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { Screen } from '@/ui/components/Screen';
import {
  parseProductFormValues,
  type ProductFormValues,
} from '@/ui/products/product-form-values';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

const INITIAL_VALUES: ProductFormValues = {
  name: '',
  variant: '',
  barcode: '',
  regularSalePrice: '',
  initialStock: '0',
  initialUnitCost: '',
  minimumStock: '',
};

export default function NewProductScreen() {
  const router = useRouter();
  const { inventory, persistence, productServices } = useAppRuntime();
  const [values, setValues] = useState<ProductFormValues>(INITIAL_VALUES);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialStockNumber = /^\d+$/.test(values.initialStock.trim())
    ? Number(values.initialStock.trim())
    : 0;
  const requiresInitialCost =
    Number.isSafeInteger(initialStockNumber) && initialStockNumber > 0;

  function updateValue<Key extends keyof ProductFormValues>(
    key: Key,
    value: ProductFormValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    if (isSubmitting || productServices === null) {
      return;
    }

    const parsed = parseProductFormValues(values);

    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await productServices.createProduct.execute({
        inventoryId: inventory.id,
        ...parsed.input,
      });
      router.back();
    } catch (error) {
      setErrorMessage(
        error instanceof TypeError || error instanceof RangeError
          ? 'Revisa los datos del producto antes de guardar.'
          : 'No pudimos guardar el producto. Intenta nuevamente.',
      );
      setIsSubmitting(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <View style={styles.intro}>
        <Text style={styles.supportingText}>
          Registra lo necesario para comenzar. Podrás completar otros datos más
          adelante.
        </Text>
      </View>

      {persistence === 'web-preview' ? (
        <View style={styles.previewNotice}>
          <Text style={styles.previewText}>
            La vista web no guarda productos. Abre StockApp en Expo Go para usar
            este formulario.
          </Text>
        </View>
      ) : null}

      <View style={styles.form}>
        <FormField
          inputProps={{
            autoCapitalize: 'words',
            autoCorrect: false,
            editable: !isSubmitting,
            onChangeText: (value) => updateValue('name', value),
            placeholder: 'Coca-Cola',
            returnKeyType: 'next',
            value: values.name,
          }}
          label="Nombre *"
        />

        <FormField
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

        <FormField
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

        <FormField
          inputProps={{
            editable: !isSubmitting,
            keyboardType: 'decimal-pad',
            onChangeText: (value) => updateValue('regularSalePrice', value),
            placeholder: '1.00',
            returnKeyType: 'next',
            value: values.regularSalePrice,
          }}
          label={`Precio habitual (${inventory.currency}) *`}
        />

        <FormField
          hint="Usa únicamente unidades enteras."
          inputProps={{
            editable: !isSubmitting,
            keyboardType: 'number-pad',
            onChangeText: (value) => updateValue('initialStock', value),
            placeholder: '0',
            returnKeyType: 'next',
            value: values.initialStock,
          }}
          label="Stock inicial *"
        />

        {requiresInitialCost ? (
          <FormField
            hint="Se utiliza para estimar la ganancia de estas unidades."
            inputProps={{
              editable: !isSubmitting,
              keyboardType: 'decimal-pad',
              onChangeText: (value) => updateValue('initialUnitCost', value),
              placeholder: '0.70',
              returnKeyType: 'next',
              value: values.initialUnitCost,
            }}
            label={`Costo unitario inicial (${inventory.currency}) *`}
          />
        ) : (
          <Text style={styles.fieldHint}>
            Con stock inicial 0 no se registra un costo desconocido como cero.
          </Text>
        )}

        <FormField
          hint="Déjalo vacío si todavía no deseas una alerta de stock bajo."
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
          accessibilityState={{
            busy: isSubmitting,
            disabled: isSubmitting || productServices === null,
          }}
          disabled={isSubmitting || productServices === null}
          onPress={() => void handleSubmit()}
          style={({ pressed }) => [
            styles.submitAction,
            pressed && !isSubmitting && styles.submitActionPressed,
            (isSubmitting || productServices === null) &&
              styles.submitActionDisabled,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.submitActionText}>Guardar producto</Text>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

interface FormFieldProps {
  readonly hint?: string;
  readonly inputProps: TextInputProps;
  readonly label: string;
  readonly optional?: boolean;
}

function FormField({ hint, inputProps, label, optional }: FormFieldProps) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optional ? <Text style={styles.optionalText}>Opcional</Text> : null}
      </View>
      <TextInput
        accessibilityLabel={label.replace(' *', '')}
        placeholderTextColor={colors.textSecondary}
        selectionColor={colors.accent}
        style={styles.input}
        {...inputProps}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: colors.danger,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  field: {
    gap: spacing.sm,
  },
  fieldHint: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  form: {
    gap: spacing.lg,
    maxWidth: 560,
    width: '100%',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.size.body,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  intro: {
    gap: spacing.sm,
    maxWidth: 560,
  },
  label: {
    color: colors.text,
    flexShrink: 1,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  optionalText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
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
