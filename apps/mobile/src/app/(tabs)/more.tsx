import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';
import {
  BACKUP_ROUTE,
  backupAvailability,
} from '@/ui/backup/backup-presentation';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';

const FUTURE_SECTIONS = ['Configuración', 'Acerca de'];

export default function MoreScreen() {
  const router = useRouter();
  const { backupServices } = useAppRuntime();
  const backup = backupAvailability(backupServices !== null);

  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Más
        </Text>
      </View>

      <Section title="Datos">
        <View style={styles.list}>
          <Pressable
            accessibilityHint={
              backup.enabled
                ? 'Abre la pantalla para crear una copia de tus datos.'
                : 'Disponible únicamente en la aplicación móvil.'
            }
            accessibilityRole="button"
            disabled={!backup.enabled}
            onPress={() => router.push(BACKUP_ROUTE)}
            style={({ pressed }) => [
              styles.row,
              pressed && backup.enabled && styles.rowPressed,
              !backup.enabled && styles.rowDisabled,
            ]}
          >
            <Text style={styles.rowLabel}>Crear respaldo</Text>
            <Text style={styles.rowStatus}>{backup.status ?? 'Abrir'}</Text>
          </Pressable>
        </View>
      </Section>

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
  rowDisabled: {
    opacity: 0.6,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
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
