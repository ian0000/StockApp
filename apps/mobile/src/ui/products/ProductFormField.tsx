import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, radii, spacing, typography } from '../theme/tokens';

interface ProductFormFieldProps {
  readonly hint?: string;
  readonly inputProps: TextInputProps;
  readonly label: string;
  readonly optional?: boolean;
}

export function ProductFormField({
  hint,
  inputProps,
  label,
  optional,
}: ProductFormFieldProps) {
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
  field: {
    gap: spacing.sm,
  },
  fieldHint: {
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
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
});
