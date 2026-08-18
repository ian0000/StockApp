import { createInventory } from '@stock-app/domain';
import { eq } from 'drizzle-orm';
import { deleteDatabaseAsync } from 'expo-sqlite';

import {
  createInventoryRepository,
  initializeAppDatabase,
  inventories,
  openAppDatabase,
} from '../../src/infrastructure/sqlite/index';

interface SmokeResult {
  readonly insertCase: 'passed';
  readonly duplicateCase: 'passed';
}

/**
 * Manual native-runtime verification for Expo Go or a development build.
 * Import and invoke it from a temporary native-only development entry.
 * It uses and removes a dedicated disposable database without touching app data.
 */
export async function runSqliteInventoryRepositorySmokeTest(): Promise<SmokeResult> {
  const databaseName = `stockapp-infra-004-${Date.now()}.db`;
  const openedDatabase = await openAppDatabase(databaseName);

  try {
    const database = await initializeAppDatabase(openedDatabase);
    const repository = createInventoryRepository(database.db);
    const inventory = createInventory({
      id: '019cf123-4567-7890-abcd-ef1234567890',
      name: 'Mi Negocio',
      currency: 'USD',
      createdAt: 1_776_444_000_000,
      updatedAt: 1_776_444_001_000,
    });

    await repository.save(inventory);

    const rows = database.db
      .select()
      .from(inventories)
      .where(eq(inventories.id, inventory.id))
      .all();

    if (rows.length !== 1) {
      throw new Error(`Expected one Inventory row, received ${rows.length}.`);
    }

    const row = rows[0];

    if (
      row.id !== inventory.id ||
      row.name !== inventory.name ||
      row.currency !== inventory.currency ||
      row.createdAt !== inventory.createdAt ||
      row.updatedAt !== inventory.updatedAt
    ) {
      throw new Error('Persisted Inventory does not match the Domain value.');
    }

    let duplicateError: unknown;

    try {
      await repository.save(inventory);
    } catch (error) {
      duplicateError = error;
    }

    if (duplicateError === undefined) {
      throw new Error('Duplicate Inventory ID did not fail.');
    }

    return Object.freeze({
      insertCase: 'passed',
      duplicateCase: 'passed',
    });
  } finally {
    await openedDatabase.sqlite.closeAsync();
    await deleteDatabaseAsync(databaseName);
  }
}
