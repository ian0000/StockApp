import { drizzle } from 'drizzle-orm/expo-sqlite';

import type { BackupRestoreTransaction } from '@stock-app/application';

import type { AppDatabase } from './database';
import {
  createBackupRestoreTransaction,
  type BackupRestoreExecutor,
} from './backup-restore-transaction-core';
import * as schema from './schema';

export function createSqliteBackupRestoreTransaction(
  database: Pick<AppDatabase, 'sqlite'>,
): BackupRestoreTransaction {
  return createBackupRestoreTransaction(async (operation) => {
    await database.sqlite.withExclusiveTransactionAsync(async (transaction) => {
      await operation(
        drizzle(transaction, { schema }) as BackupRestoreExecutor,
      );
    });
  });
}
