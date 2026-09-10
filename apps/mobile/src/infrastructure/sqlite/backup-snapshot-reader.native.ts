import type {
  BackupDataV1,
  BackupSnapshotReader,
} from '@stock-app/application';
import { drizzle } from 'drizzle-orm/expo-sqlite';

import type { AppDatabase } from './database';
import {
  createBackupSnapshotReader,
  type BackupReadExecutor,
} from './backup-snapshot-reader-core';
import * as schema from './schema';

export function createSqliteBackupSnapshotReader(
  database: Pick<AppDatabase, 'sqlite'>,
): BackupSnapshotReader {
  return createBackupSnapshotReader(async (operation) => {
    let result: { readonly value: BackupDataV1 } | undefined;

    await database.sqlite.withExclusiveTransactionAsync(async (transaction) => {
      result = {
        value: await operation(
          drizzle(transaction, { schema }) as BackupReadExecutor,
        ),
      };
    });

    if (result === undefined) {
      throw new Error('SQLite backup transaction completed without a result.');
    }

    return result.value;
  });
}
