import { StyleSheet, Text, View } from 'react-native';

import type { HistoryEntry } from '@stock-app/application';

import { colors, radii, spacing, typography } from '../theme/tokens';
import {
  createHistoryRowPresentation,
  formatHistoryTimestamp,
  type HistoryRowVariant,
} from './history-presentation';

interface HistoryOperationRowProps {
  readonly currency: string;
  readonly entry: HistoryEntry;
  readonly variant: HistoryRowVariant;
}

export function HistoryOperationRow({
  currency,
  entry,
  variant,
}: HistoryOperationRowProps) {
  const row = createHistoryRowPresentation(entry, currency, variant);

  return (
    <View
      accessibilityRole="summary"
      style={[styles.row, variant === 'recent' && styles.recentRow]}
    >
      <View style={styles.rowCopy}>
        <View style={styles.typeLine}>
          <Text style={styles.typeLabel}>{row.typeLabel}</Text>
          {row.isVoided ? (
            <Text style={styles.voidedLabel}>Anulada</Text>
          ) : null}
        </View>
        <Text style={[styles.primary, row.isVoided && styles.voidedText]}>
          {row.primary}
        </Text>
        {row.secondary ? (
          <Text style={styles.secondaryText}>{row.secondary}</Text>
        ) : null}
        <Text style={styles.detail}>{row.detail}</Text>
      </View>
      <Text style={styles.timestamp}>
        {formatHistoryTimestamp(row.timestamp)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  detail: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  primary: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  recentRow: {
    minHeight: 96,
    padding: spacing.md,
  },
  row: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 112,
    padding: spacing.lg,
  },
  rowCopy: { flex: 1, gap: spacing.xs },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  timestamp: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    textAlign: 'right',
  },
  typeLabel: {
    color: colors.accent,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.8,
  },
  typeLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  voidedLabel: {
    color: colors.danger,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  voidedText: { textDecorationLine: 'line-through' },
});
