import {
  BackupValidationError,
  createBackupRestorePreview,
  parseBackupV1,
  type BackupRestorePreview,
  type ParsedBackupV1,
} from '@stock-app/application';

import type { BackupFilePicker } from '@/infrastructure/backup/backup-file-picker';

export const RESTORE_BACKUP_ROUTE = '/backup/restore' as const;

export const RESTORE_CONFIRMATION = Object.freeze({
  title: '¿Restaurar este respaldo?',
  message:
    'Los datos actuales de StockApp serán reemplazados por los datos de este respaldo. Esta acción no combina ambos inventarios.\n\nSi quieres conservar tus datos actuales, crea primero un respaldo.',
  cancelLabel: 'Cancelar',
  confirmLabel: 'Restaurar',
});

export interface RestoreConfirmationAction {
  readonly text: string;
  readonly style: 'cancel' | 'destructive';
  readonly onPress?: () => void;
}

export function createRestoreConfirmationActions(
  onConfirm: () => void,
): readonly [RestoreConfirmationAction, RestoreConfirmationAction] {
  return Object.freeze([
    Object.freeze({ text: RESTORE_CONFIRMATION.cancelLabel, style: 'cancel' }),
    Object.freeze({
      text: RESTORE_CONFIRMATION.confirmLabel,
      style: 'destructive',
      onPress: onConfirm,
    }),
  ]);
}

export interface PreparedBackupRestore {
  readonly fileName: string;
  readonly backup: ParsedBackupV1;
  readonly preview: BackupRestorePreview;
}

export async function selectAndValidateBackup(
  picker: BackupFilePicker,
): Promise<PreparedBackupRestore | null> {
  const file = await picker.pick();
  if (file === null) return null;

  const backup = parseBackupV1(file.contents);
  return Object.freeze({
    fileName: file.name,
    backup,
    preview: createBackupRestorePreview(backup),
  });
}

export function restoreValidationMessage(error: unknown): string {
  if (error instanceof BackupValidationError) {
    if (error.code === 'WRONG_FORMAT') {
      return 'Este archivo no es un respaldo de StockApp.';
    }
    if (error.code === 'UNSUPPORTED_VERSION') {
      return 'Esta versión del respaldo no es compatible con esta versión de StockApp.';
    }
    return 'El archivo de respaldo no es válido.';
  }

  return 'No pudimos leer el respaldo. Elige otro archivo e inténtalo nuevamente.';
}
