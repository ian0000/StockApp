import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  createBackupRestorePreview,
  parseBackupV1,
  type ParsedBackupV1,
} from '@stock-app/application';

import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import { createBackupSubmissionGate } from '@/ui/backup/backup-presentation';
import {
  RESTORE_CONFIRMATION,
  createRestoreConfirmationActions,
  restoreValidationMessage,
} from '@/ui/backup/restore-presentation';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

type RestoreState =
  | { readonly phase: 'idle' | 'reading' | 'validating' }
  | {
      readonly phase: 'preview' | 'restoring' | 'success';
      readonly backup: ParsedBackupV1;
      readonly fileName: string;
    }
  | {
      readonly phase: 'invalid' | 'restore-error' | 'rehydrate-error';
      readonly message: string;
    };

export default function RestoreBackupScreen() {
  const router = useRouter();
  const { backupServices, rehydrateInventory } = useAppRuntime();
  const pickerGate = useRef(createBackupSubmissionGate());
  const restoreGate = useRef(createBackupSubmissionGate());
  const [state, setState] = useState<RestoreState>({ phase: 'idle' });

  const selectBackup = async () => {
    if (backupServices === null || !pickerGate.current.tryStart()) return;

    setState({ phase: 'reading' });
    try {
      const file = await backupServices.filePicker.pick();
      if (file === null) {
        setState({ phase: 'idle' });
        return;
      }

      setState({ phase: 'validating' });
      const backup = parseBackupV1(file.contents);
      setState({ phase: 'preview', backup, fileName: file.name });
    } catch (error) {
      setState({ phase: 'invalid', message: restoreValidationMessage(error) });
    } finally {
      pickerGate.current.finish();
    }
  };

  const navigateHome = () => {
    router.dismissAll();
    router.replace('/');
  };

  const restore = async (backup: ParsedBackupV1, fileName: string) => {
    if (backupServices === null || !restoreGate.current.tryStart()) return;

    setState({ phase: 'restoring', backup, fileName });
    try {
      await backupServices.restoreBackup.execute({ backup });
    } catch {
      setState({
        phase: 'restore-error',
        message:
          'No pudimos restaurar el respaldo. Tus datos actuales no fueron modificados.',
      });
      restoreGate.current.finish();
      return;
    }

    try {
      await rehydrateInventory();
    } catch {
      setState({
        phase: 'rehydrate-error',
        message:
          'El respaldo se restauró, pero no pudimos actualizar la pantalla. Cierra y vuelve a abrir StockApp.',
      });
      restoreGate.current.finish();
      return;
    }

    setState({ phase: 'success', backup, fileName });
    restoreGate.current.finish();
    Alert.alert('Respaldo restaurado', 'Tus datos ya están disponibles.', [
      { text: 'Ir a Inicio', onPress: navigateHome },
    ]);
  };

  const confirmRestore = (backup: ParsedBackupV1, fileName: string) => {
    Alert.alert(RESTORE_CONFIRMATION.title, RESTORE_CONFIRMATION.message, [
      ...createRestoreConfirmationActions(() => void restore(backup, fileName)),
    ]);
  };

  const isBusy =
    state.phase === 'reading' ||
    state.phase === 'validating' ||
    state.phase === 'restoring';
  const isAvailable = backupServices !== null;
  const prepared =
    state.phase === 'preview' ||
    state.phase === 'restoring' ||
    state.phase === 'success'
      ? state
      : null;
  const preview =
    prepared === null ? null : createBackupRestorePreview(prepared.backup);

  return (
    <Screen edges={['bottom']}>
      <Section title="Restaurar respaldo">
        <View style={styles.card}>
          <Text style={styles.description}>
            Selecciona un respaldo de StockApp para restaurar tus datos.
          </Text>
          <Text style={styles.warning}>
            La restauración reemplaza los datos actuales; no combina
            inventarios.
          </Text>
        </View>
      </Section>

      {!isAvailable ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <Text style={styles.noticeText}>
            La restauración está disponible solo en la aplicación móvil.
          </Text>
        </View>
      ) : null}

      {state.phase === 'reading' || state.phase === 'validating' ? (
        <View accessibilityLiveRegion="polite" style={styles.progressCard}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.progressText}>
            {state.phase === 'reading'
              ? 'Leyendo respaldo…'
              : 'Comprobando respaldo…'}
          </Text>
        </View>
      ) : null}

      {preview !== null && prepared !== null ? (
        <Section title="Respaldo válido">
          <View style={styles.card}>
            <Text style={styles.fileName}>{prepared.fileName}</Text>
            <Text style={styles.detail}>
              Creado: {new Date(preview.createdAt).toLocaleString()}
            </Text>
            <Text style={styles.detail}>
              Inventario: {preview.inventoryName}
            </Text>
            <Text style={styles.detail}>Productos: {preview.products}</Text>
            <Text style={styles.detail}>Ventas: {preview.sales}</Text>
            <Text style={styles.detail}>Compras: {preview.purchases}</Text>
            <Text style={styles.detail}>
              Ajustes: {preview.stockAdjustments}
            </Text>
          </View>
        </Section>
      ) : null}

      {state.phase === 'invalid' ||
      state.phase === 'restore-error' ||
      state.phase === 'rehydrate-error' ? (
        <View accessibilityLiveRegion="assertive" style={styles.error}>
          <Text style={styles.errorTitle}>
            {state.phase === 'invalid'
              ? 'No podemos usar este archivo.'
              : 'No pudimos completar la restauración.'}
          </Text>
          <Text style={styles.errorText}>{state.message}</Text>
        </View>
      ) : null}

      {state.phase === 'success' ? (
        <View accessibilityLiveRegion="polite" style={styles.success}>
          <Text style={styles.successTitle}>Respaldo restaurado</Text>
          <Text style={styles.detail}>Tus datos ya están disponibles.</Text>
        </View>
      ) : null}

      {state.phase === 'preview' ? (
        <Pressable
          accessibilityHint="Reemplaza todos los datos actuales por el respaldo seleccionado después de confirmarlo."
          accessibilityRole="button"
          onPress={() => confirmRestore(state.backup, state.fileName)}
          style={({ pressed }) => [
            styles.dangerAction,
            pressed && styles.dangerActionPressed,
          ]}
        >
          <Text style={styles.dangerActionText}>Restaurar y reemplazar</Text>
        </Pressable>
      ) : null}

      {state.phase === 'restoring' ? (
        <View accessibilityLiveRegion="polite" style={styles.progressCard}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.progressText}>Restaurando…</Text>
        </View>
      ) : null}

      {state.phase === 'success' ? (
        <Pressable
          accessibilityRole="button"
          onPress={navigateHome}
          style={({ pressed }) => [
            styles.primaryAction,
            pressed && styles.primaryActionPressed,
          ]}
        >
          <Text style={styles.primaryActionText}>Ir a Inicio</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel={
            state.phase === 'invalid'
              ? 'Elegir otro respaldo'
              : 'Elegir respaldo'
          }
          accessibilityRole="button"
          disabled={!isAvailable || isBusy}
          onPress={() => void selectBackup()}
          style={({ pressed }) => [
            styles.primaryAction,
            pressed && styles.primaryActionPressed,
            (!isAvailable || isBusy) && styles.actionDisabled,
          ]}
        >
          <Text style={styles.primaryActionText}>
            {state.phase === 'invalid'
              ? 'Elegir otro respaldo'
              : 'Elegir respaldo'}
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionDisabled: { opacity: 0.55 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  dangerAction: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 54,
    padding: spacing.md,
  },
  dangerActionPressed: { backgroundColor: colors.surfaceMuted },
  dangerActionText: {
    color: colors.danger,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  description: {
    color: colors.text,
    fontSize: typography.size.body,
    lineHeight: 24,
  },
  detail: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 22,
  },
  error: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  errorText: { color: colors.textSecondary, fontSize: typography.size.body },
  errorTitle: {
    color: colors.danger,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  fileName: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
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
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 54,
    padding: spacing.md,
  },
  primaryActionPressed: { backgroundColor: colors.accentPressed },
  primaryActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  progressCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  progressText: { color: colors.textSecondary, fontSize: typography.size.body },
  success: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  successTitle: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  warning: {
    color: colors.danger,
    fontSize: typography.size.body,
    lineHeight: 24,
  },
});
