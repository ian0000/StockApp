export const BACKUP_ROUTE = '/backup' as const;

export interface BackupAvailability {
  readonly enabled: boolean;
  readonly status: 'Solo móvil' | null;
}

export function backupAvailability(
  hasNativeServices: boolean,
): BackupAvailability {
  return hasNativeServices
    ? { enabled: true, status: null }
    : { enabled: false, status: 'Solo móvil' };
}

export interface BackupSubmissionGate {
  tryStart(): boolean;
  finish(): void;
}

export type BackupScreenPhase = 'idle' | 'creating' | 'prepared' | 'error';

export interface BackupScreenStatus {
  readonly actionLabel: 'Crear respaldo' | 'Creando respaldo…' | 'Reintentar';
  readonly message: string | null;
  readonly title: string | null;
}

export function backupScreenStatus(
  phase: BackupScreenPhase,
): BackupScreenStatus {
  if (phase === 'creating') {
    return {
      actionLabel: 'Creando respaldo…',
      title: null,
      message: null,
    };
  }
  if (phase === 'prepared') {
    return {
      actionLabel: 'Crear respaldo',
      title: 'Respaldo preparado',
      message: 'Elige dónde guardar una copia en la hoja de compartir.',
    };
  }
  if (phase === 'error') {
    return {
      actionLabel: 'Reintentar',
      title: 'No pudimos crear el respaldo.',
      message: 'Inténtalo nuevamente.',
    };
  }
  return {
    actionLabel: 'Crear respaldo',
    title: null,
    message: null,
  };
}

export function createBackupSubmissionGate(): BackupSubmissionGate {
  let active = false;

  return {
    tryStart() {
      if (active) {
        return false;
      }
      active = true;
      return true;
    },
    finish() {
      active = false;
    },
  };
}
