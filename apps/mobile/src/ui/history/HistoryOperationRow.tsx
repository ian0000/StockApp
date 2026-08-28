import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  readonly onOpenSale?: (saleId: string) => void;
  readonly variant: HistoryRowVariant;
}

export function HistoryOperationRow({
  currency,
  entry,
  onOpenSale,
  variant,
}: HistoryOperationRowProps) {
  const row = createHistoryRowPresentation(entry, currency, variant);
  const content = (
    <>
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
        {entry.type === 'SALE' && onOpenSale !== undefined ? (
          <Text style={styles.openHint}>Ver detalle</Text>
        ) : null}
      </View>
      <Text style={styles.timestamp}>
        {formatHistoryTimestamp(row.timestamp)}
      </Text>
    </>
  );

  if (entry.type === 'SALE' && onOpenSale !== undefined) {
    return (
      <Pressable
        accessibilityHint="Abre el detalle de esta venta"
        accessibilityLabel={`Venta ${row.primary}, ${row.detail}`}
        accessibilityRole="button"
        onPress={() => onOpenSale(entry.id)}
        style={({ pressed }) => [
          styles.row,
          variant === 'recent' && styles.recentRow,
          pressed && styles.rowPressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityRole="summary"
      style={[styles.row, variant === 'recent' && styles.recentRow]}
    >
      {content}
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
  openHint: {
    color: colors.accent,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.semibold,
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
  rowPressed: { backgroundColor: colors.accentSoft },
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
