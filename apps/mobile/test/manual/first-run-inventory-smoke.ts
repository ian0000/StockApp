import { MultipleInventoriesNotSupportedError } from '@stock-app/application';
import { deleteDatabaseAsync } from 'expo-sqlite';

import { createAppRuntime } from '../../src/composition/create-app-services';

interface SmokeResult {
  readonly freshDatabase: 'passed';
  readonly multipleInventories: 'passed';
  readonly restartPersistence: 'passed';
}

/**
 * Manual native-runtime verification for Expo Go or a development build.
 * Import and invoke it from a temporary native-only development entry.
 * It uses and removes a dedicated disposable database without touching app data.
 */
export async function runFirstRunInventorySmokeTest(): Promise<SmokeResult> {
  const databaseName = `stockapp-first-run-${Date.now()}.db`;
  let firstRuntime: Awaited<ReturnType<typeof createAppRuntime>> | undefined;
  let restartedRuntime:
    Awaited<ReturnType<typeof createAppRuntime>> | undefined;

  try {
    firstRuntime = await createAppRuntime({ databaseName });

    if ((await firstRuntime.services.getCurrentInventory.execute()) !== null) {
      throw new Error('A fresh database unexpectedly contains an Inventory.');
    }

    const created = await firstRuntime.services.createInventory.execute({
      name: 'Smoke Shop',
      currency: 'USD',
    });
    const current = await firstRuntime.services.getCurrentInventory.execute();

    if (current?.id !== created.id || current.name !== 'Smoke Shop') {
      throw new Error(
        'Created Inventory was not available in the same runtime.',
      );
    }

    await firstRuntime.database.sqlite.closeAsync();
    firstRuntime = undefined;

    restartedRuntime = await createAppRuntime({ databaseName });
    const afterRestart =
      await restartedRuntime.services.getCurrentInventory.execute();

    if (
      afterRestart?.id !== created.id ||
      afterRestart.name !== 'Smoke Shop' ||
      afterRestart.currency !== 'USD'
    ) {
      throw new Error('Inventory did not survive a native runtime restart.');
    }

    await restartedRuntime.services.createInventory.execute({
      name: 'Second Inventory',
      currency: 'USD',
    });

    await assertMultipleInventoriesFail(restartedRuntime.services);

    return Object.freeze({
      freshDatabase: 'passed',
      multipleInventories: 'passed',
      restartPersistence: 'passed',
    });
  } finally {
    if (firstRuntime !== undefined) {
      await firstRuntime.database.sqlite.closeAsync();
    }

    if (restartedRuntime !== undefined) {
      await restartedRuntime.database.sqlite.closeAsync();
    }

    await deleteDatabaseAsync(databaseName);
  }
}

async function assertMultipleInventoriesFail(
  services: Awaited<ReturnType<typeof createAppRuntime>>['services'],
): Promise<void> {
  try {
    await services.getCurrentInventory.execute();
  } catch (error) {
    if (error instanceof MultipleInventoriesNotSupportedError) {
      return;
    }

    throw error;
  }

  throw new Error('Multiple inventories were selected silently.');
}
