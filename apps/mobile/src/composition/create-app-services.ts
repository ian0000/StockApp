import {
  createInventoryRepository,
  createSqliteHistoryReader,
  createSqlitePurchaseDetailsReader,
  createSqliteSaleDetailsReader,
  createSqliteInventoryStateRepository,
  createSqliteProductRepository,
  createSqliteSalesSummaryReader,
  createSqliteTransactionManager,
  initializeAppDatabase,
  openAppDatabase,
  type AppDatabase,
} from '../infrastructure/sqlite';
import { UuidV7Generator } from '../infrastructure/identity';
import { SystemClock } from '../infrastructure/time';
import { assembleAppServices, type AppServices } from './app-services';

export interface CreateAppServicesOptions {
  readonly databaseName?: string;
}

interface AppRuntime {
  readonly database: AppDatabase;
  readonly services: AppServices;
}

export async function createAppRuntime(
  options: CreateAppServicesOptions = {},
): Promise<AppRuntime> {
  const database = await openAppDatabase(options.databaseName);

  try {
    await initializeAppDatabase(database);

    const clock = new SystemClock();
    const idGenerator = new UuidV7Generator(clock);
    const inventoryStateRepository = createSqliteInventoryStateRepository(
      database.db,
    );
    const productRepository = createSqliteProductRepository(database.db);
    const services = assembleAppServices({
      clock,
      idGenerator,
      historyReader: createSqliteHistoryReader(database.db),
      inventoryRepository: createInventoryRepository(database.db),
      inventoryStateRepository,
      productRepository,
      purchaseDetailsReader: createSqlitePurchaseDetailsReader(database.db),
      saleDetailsReader: createSqliteSaleDetailsReader(database.db),
      salesSummaryReader: createSqliteSalesSummaryReader(database.db),
      transactionManager: createSqliteTransactionManager(database),
    });

    return Object.freeze({ database, services });
  } catch (error) {
    try {
      await database.sqlite.closeAsync();
    } catch {
      // Preserve the initialization failure instead of masking it with cleanup.
    }

    throw error;
  }
}

export async function createAppServices(
  options: CreateAppServicesOptions = {},
): Promise<AppServices> {
  return (await createAppRuntime(options)).services;
}
