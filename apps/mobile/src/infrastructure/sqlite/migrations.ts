import migrations from '../../../drizzle/migrations';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { openAppDatabase, type AppDatabase } from './database';

export async function migrateDatabase(
  database: Pick<AppDatabase, 'db'>,
): Promise<void> {
  await migrate(database.db, migrations);
}

export async function initializeAppDatabase(): Promise<AppDatabase> {
  const database = await openAppDatabase();

  await migrateDatabase(database);

  return database;
}
