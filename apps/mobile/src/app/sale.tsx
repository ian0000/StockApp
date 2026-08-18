import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/ui/components/EmptyState';
import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

export default function NewSaleScreen() {
  const [searchText, setSearchText] = useState('');
  const hasSearch = searchText.trim().length > 0;

  return (
    <Screen edges={['bottom']}>
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
          accessibilityHint="El escáner se habilitará en una etapa posterior"
          accessibilityLabel="Escanear código, no disponible todavía"
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.scannerAction}
        >
          <Text style={styles.scannerActionText}>Escanear</Text>
          <Text style={styles.scannerStatus}>Próximamente</Text>
        </Pressable>
      </View>

      <View accessibilityLiveRegion="polite">
        {hasSearch ? (
          <Section title="RESULTADOS" titleVariant="eyebrow">
            <EmptyState
              message="No encontramos productos"
              supportingText="La búsqueda se conectará a tus productos registrados."
            />
          </Section>
        ) : (
          <Section title="RECIENTES" titleVariant="eyebrow">
            <EmptyState message="Aún no tienes productos recientes" />
          </Section>
        )}
      </View>

      <View style={styles.basketEmptyState}>
        <Text style={styles.basketTitle}>Tu venta está vacía</Text>
        <Text style={styles.basketSupportingText}>
          Busca un producto para comenzar.
        </Text>
      </View>
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
    opacity: 0.68,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
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
});
