import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Inventory } from '@stock-app/domain';

import type { AppServices } from '@/composition';
import { Screen } from '@/ui/components/Screen';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

interface FirstRunSetupProps {
  readonly createInventory: AppServices['createInventory'];
  readonly onCreated: (inventory: Inventory) => void;
}

export function FirstRunSetup({
  createInventory,
  onCreated,
}: FirstRunSetupProps) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    if (name.trim().length === 0) {
      setErrorMessage('Escribe el nombre de tu negocio.');
      return;
    }

    if (!/^[A-Za-z]{3}$/.test(currency.trim())) {
      setErrorMessage('La moneda debe tener tres letras, por ejemplo USD.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const inventory = await createInventory.execute({ name, currency });
      onCreated(inventory);
    } catch (error) {
      setErrorMessage(
        error instanceof TypeError || error instanceof RangeError
          ? 'Revisa el nombre y la moneda antes de continuar.'
          : 'No pudimos crear tu inventario. Intenta nuevamente.',
      );
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>
          Configura tu inventario
        </Text>
        <Text style={styles.supportingText}>
          Solo necesitamos estos datos para comenzar.
        </Text>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>¿Cómo quieres llamar a tu negocio?</Text>
          <TextInput
            accessibilityLabel="Nombre del negocio"
            autoCapitalize="words"
            autoCorrect={false}
            editable={!isSubmitting}
            onChangeText={setName}
            placeholder="Mi Negocio"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="next"
            selectionColor={colors.accent}
            style={styles.input}
            value={name}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Moneda</Text>
          <TextInput
            accessibilityHint="Código de moneda de tres letras"
            accessibilityLabel="Moneda"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!isSubmitting}
            maxLength={3}
            onChangeText={(value) => setCurrency(value.toUpperCase())}
            placeholder="USD"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="done"
            selectionColor={colors.accent}
            style={styles.input}
            value={currency}
          />
          <Text style={styles.fieldHint}>
            Puedes editar USD antes de comenzar.
          </Text>
        </View>

        {errorMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}

        <Pressable
          accessibilityLabel="Comenzar"
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
            <Text style={styles.submitActionText}>Comenzar</Text>
          )}
        </Pressable>
      </View>
    </Screen>
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
    maxWidth: 520,
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
    maxWidth: 520,
  },
  label: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
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
    opacity: 0.65,
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
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.8,
  },
});
