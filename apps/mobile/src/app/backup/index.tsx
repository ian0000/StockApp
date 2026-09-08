import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import {
  backupScreenStatus,
  createBackupSubmissionGate,
  type BackupScreenPhase,
} from '@/ui/backup/backup-presentation';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';
import { RESTORE_BACKUP_ROUTE } from '@/ui/backup/restore-presentation';

export default function BackupScreen() {
  const router = useRouter();
  const { backupServices, inventory } = useAppRuntime();
  const gate = useRef(createBackupSubmissionGate());
  const [state, setState] = useState<BackupScreenPhase>('idle');

  const createAndShareBackup = async () => {
    if (backupServices === null || !gate.current.tryStart()) {
      return;
    }

    setState('creating');
    try {
      const artifact = await backupServices.createBackup.execute({
        inventoryId: inventory.id,
      });
      setState('prepared');
      await backupServices.fileExporter.export(artifact);
    } catch {
      setState('error');
    } finally {
      gate.current.finish();
    }
  };

  const isCreating = state === 'creating';
  const isAvailable = backupServices !== null;
  const status = backupScreenStatus(state);

  return (
    <Screen edges={['bottom']}>
      <Section title="Respaldo local">
        <View style={styles.card}>
          <Text style={styles.description}>
            Crea una copia de tus productos, stock y operaciones para guardarla
            fuera de StockApp.
          </Text>
          <Text style={styles.privacy}>Guárdala en un lugar seguro.</Text>
          <Text style={styles.detail}>
            El archivo contiene información de tu negocio y no está cifrado.
          </Text>
        </View>
      </Section>

      {!isAvailable ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <Text style={styles.noticeText}>
            Los respaldos están disponibles solo en la aplicación móvil.
          </Text>
        </View>
      ) : null}

      {state === 'prepared' ? (
        <View accessibilityLiveRegion="polite" style={styles.success}>
          <Text style={styles.successTitle}>{status.title}</Text>
          <Text style={styles.successText}>{status.message}</Text>
        </View>
      ) : null}

      {state === 'error' ? (
        <View accessibilityLiveRegion="assertive" style={styles.error}>
          <Text style={styles.errorTitle}>{status.title}</Text>
          <Text style={styles.errorText}>{status.message}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityLabel={
          state === 'error' ? 'Reintentar crear respaldo' : 'Crear respaldo'
        }
        accessibilityRole="button"
        disabled={!isAvailable || isCreating}
        onPress={() => void createAndShareBackup()}
        style={({ pressed }) => [
          styles.action,
          pressed && styles.actionPressed,
          (!isAvailable || isCreating) && styles.actionDisabled,
        ]}
      >
        {isCreating ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.actionText}>{status.actionLabel}</Text>
        )}
      </Pressable>

      <Pressable
        accessibilityHint="Selecciona una copia existente y reemplaza los datos actuales después de confirmarlo."
        accessibilityLabel="Restaurar respaldo"
        accessibilityRole="button"
        disabled={!isAvailable || isCreating}
        onPress={() => router.push(RESTORE_BACKUP_ROUTE)}
        style={({ pressed }) => [
          styles.secondaryAction,
          pressed && styles.secondaryActionPressed,
          (!isAvailable || isCreating) && styles.actionDisabled,
        ]}
      >
        <Text style={styles.secondaryActionText}>Restaurar respaldo</Text>
      </Pressable>

      {isCreating ? (
        <Text accessibilityLiveRegion="polite" style={styles.progress}>
          Creando respaldo…
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionPressed: {
    backgroundColor: colors.accentPressed,
  },
  actionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  description: {
    color: colors.text,
    fontSize: typography.size.body,
    lineHeight: 24,
  },
  detail: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  error: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  notice: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  noticeText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
  },
  privacy: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  progress: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    textAlign: 'center',
  },
  secondaryAction: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  secondaryActionPressed: {
    backgroundColor: colors.accentSoft,
  },
  secondaryActionText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  success: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  successText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
  },
  successTitle: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
});
