import migrations from '../../../drizzle/migrations';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { openAppDatabase, type AppDatabase } from './database';

export async function migrateDatabase(
  database: Pick<AppDatabase, 'db'>,
): Promise<void> {
  await migrate(database.db, migrations);
}

export async function initializeAppDatabase(
  database?: AppDatabase,
): Promise<AppDatabase> {
  const initializedDatabase = database ?? (await openAppDatabase());

  await migrateDatabase(initializedDatabase);

  return initializedDatabase;
}
