import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../theme/tokens';

interface EmptyStateProps {
  readonly message: string;
  readonly supportingText?: string;
}

export function EmptyState({ message, supportingText }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.indicator} />
      <View style={styles.copy}>
        <Text style={styles.message}>{message}</Text>
        {supportingText ? (
          <Text style={styles.supportingText}>{supportingText}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    padding: spacing.lg,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  indicator: {
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    height: 10,
    width: 10,
  },
  message: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  supportingText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
});
