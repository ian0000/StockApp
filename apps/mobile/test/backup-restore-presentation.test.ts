import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BackupValidationError,
  type StockAppBackupV1,
} from '@stock-app/application';

import type { BackupFilePicker } from '../src/infrastructure/backup/backup-file-picker';
import {
  RESTORE_BACKUP_ROUTE,
  RESTORE_CONFIRMATION,
  createRestoreConfirmationActions,
  restoreValidationMessage,
  selectAndValidateBackup,
} from '../src/ui/backup/restore-presentation';

function emptyBackup(): StockAppBackupV1 {
  return {
    format: 'stockapp-backup',
    formatVersion: 1,
    createdAt: 100,
    inventoryId: 'inventory-1',
    data: {
      inventories: [
        {
          id: 'inventory-1',
          name: 'Mi negocio',
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      products: [],
      inventoryStates: [],
      inventoryMovements: [],
      sales: [],
      saleItems: [],
      purchases: [],
      stockAdjustments: [],
    },
  };
}

test('restore uses its dedicated route and explicit replace-not-merge copy', () => {
  assert.equal(RESTORE_BACKUP_ROUTE, '/backup/restore');
  assert.match(RESTORE_CONFIRMATION.message, /reemplazados/i);
  assert.match(RESTORE_CONFIRMATION.message, /no combina/i);
  assert.match(RESTORE_CONFIRMATION.message, /crea primero un respaldo/i);
});

test('picker cancel returns to the initial state with no validation error', async () => {
  const picker: BackupFilePicker = {
    async pick() {
      return null;
    },
  };

  assert.equal(await selectAndValidateBackup(picker), null);
});

test('canceling destructive confirmation performs zero restore writes', () => {
  let writes = 0;
  const [cancel, confirm] = createRestoreConfirmationActions(() => {
    writes += 1;
  });

  cancel.onPress?.();
  assert.equal(writes, 0);
  confirm.onPress?.();
  assert.equal(writes, 1);
});

test('a valid selection produces preview counts without any restore write', async () => {
  const picker: BackupFilePicker = {
    async pick() {
      return {
        name: 'stockapp-backup.json',
        contents: JSON.stringify(emptyBackup()),
      };
    },
  };

  const prepared = await selectAndValidateBackup(picker);

  assert.equal(prepared?.fileName, 'stockapp-backup.json');
  assert.deepEqual(prepared?.preview, {
    createdAt: 100,
    inventoryId: 'inventory-1',
    inventoryName: 'Mi negocio',
    products: 0,
    archivedProducts: 0,
    sales: 0,
    voidedSales: 0,
    purchases: 0,
    voidedPurchases: 0,
    stockAdjustments: 0,
  });
});

test('an invalid selection cannot reach a restore write', async () => {
  let writes = 0;
  const picker: BackupFilePicker = {
    async pick() {
      return {
        name: 'invalid.json',
        contents: '{"format":"not-stockapp"}',
      };
    },
  };

  await assert.rejects(async () => {
    const prepared = await selectAndValidateBackup(picker);
    if (prepared) {
      writes += 1;
    }
  }, BackupValidationError);
  assert.equal(writes, 0);
});

test('maps validation categories to non-technical Spanish messages', () => {
  assert.equal(
    restoreValidationMessage(
      new BackupValidationError('WRONG_FORMAT', 'technical'),
    ),
    'Este archivo no es un respaldo de StockApp.',
  );
  assert.match(
    restoreValidationMessage(
      new BackupValidationError('UNSUPPORTED_VERSION', 'technical'),
    ),
    /no es compatible/i,
  );
  assert.equal(
    restoreValidationMessage(
      new BackupValidationError('INVALID_DOCUMENT', 'technical'),
    ),
    'El archivo de respaldo no es válido.',
  );
  assert.doesNotMatch(restoreValidationMessage(new Error('SQLITE')), /SQLITE/);
});
