import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKUP_ROUTE,
  backupAvailability,
  backupScreenStatus,
  createBackupSubmissionGate,
} from '../src/ui/backup/backup-presentation';

test('backup uses a dedicated route and is enabled only with native persistence services', () => {
  assert.equal(BACKUP_ROUTE, '/backup');
  assert.deepEqual(backupAvailability(true), {
    enabled: true,
    status: null,
  });
  assert.deepEqual(backupAvailability(false), {
    enabled: false,
    status: 'Solo móvil',
  });
});

test('presentation covers idle, loading, prepared, error and retry copy', () => {
  assert.deepEqual(backupScreenStatus('idle'), {
    actionLabel: 'Crear respaldo',
    title: null,
    message: null,
  });
  assert.equal(backupScreenStatus('creating').actionLabel, 'Creando respaldo…');
  assert.deepEqual(backupScreenStatus('prepared'), {
    actionLabel: 'Crear respaldo',
    title: 'Respaldo preparado',
    message: 'Elige dónde guardar una copia en la hoja de compartir.',
  });
  assert.deepEqual(backupScreenStatus('error'), {
    actionLabel: 'Reintentar',
    title: 'No pudimos crear el respaldo.',
    message: 'Inténtalo nuevamente.',
  });
});

test('single-flight gate blocks a second tap until the active export completes', () => {
  const gate = createBackupSubmissionGate();

  assert.equal(gate.tryStart(), true);
  assert.equal(gate.tryStart(), false);
  gate.finish();
  assert.equal(gate.tryStart(), true);
});
