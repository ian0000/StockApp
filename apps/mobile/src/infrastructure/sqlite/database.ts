import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import * as schema from './schema';

export const APP_DATABASE_NAME = 'stockapp.db';

export interface AppDatabase {
  readonly sqlite: SQLiteDatabase;
  readonly db: ExpoSQLiteDatabase<typeof schema>;
}

export async function openAppDatabase(): Promise<AppDatabase> {
  const sqlite = await openDatabaseAsync(APP_DATABASE_NAME);

  await sqlite.execAsync(
    'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;',
  );

  return Object.freeze({
    sqlite,
    db: drizzle(sqlite, { schema }),
  });
}
