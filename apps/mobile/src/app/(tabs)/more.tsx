import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

const FUTURE_SECTIONS = ['Datos y respaldo', 'Configuración', 'Acerca de'];

export default function MoreScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Más
        </Text>
      </View>

      <Section title="Opciones">
        <View style={styles.list}>
          {FUTURE_SECTIONS.map((label, index) => (
            <View
              key={label}
              style={[styles.row, index > 0 && styles.rowBorder]}
            >
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowStatus}>Próximamente</Text>
            </View>
          ))}
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowBorder: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  rowLabel: {
    color: colors.text,
    flex: 1,
    fontSize: typography.size.body,
    fontWeight: typography.weight.medium,
  },
  rowStatus: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.8,
  },
});
