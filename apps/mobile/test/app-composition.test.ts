import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdjustStockUseCase,
  ArchiveProductUseCase,
  CreateBackupUseCase,
  CreateInventoryUseCase,
  CreateProductUseCase,
  FindProductByBarcodeUseCase,
  GetCurrentInventoryUseCase,
  GetProductDetailsUseCase,
  GetPurchaseDetailsUseCase,
  GetSaleDetailsUseCase,
  GetSalesSummaryUseCase,
  GetTopSellingProductUseCase,
  ListHistoryUseCase,
  ListProductsUseCase,
  RegisterPurchaseUseCase,
  RegisterSaleUseCase,
  RestoreBackupUseCase,
  UpdateProductUseCase,
  VoidSaleUseCase,
  VoidPurchaseUseCase,
  type HistoryReader,
  type BackupRestoreTransaction,
  type BackupSnapshotReader,
  type InventoryRepository,
  type InventoryStateRepository,
  type ProductRepository,
  type ProductBarcodeReader,
  type ProductManagementRepository,
  type PurchaseDetailsReader,
  type SalesSummaryReader,
  type TopSellingProductReader,
  type SaleDetailsReader,
  type TransactionManager,
} from '@stock-app/application';
import { Money } from '@stock-app/domain';

import {
  assembleAppServices,
  initializeAppServices,
  type AppServiceDependencies,
} from '../src/composition/app-services';

function createDependencies(): {
  readonly dependencies: AppServiceDependencies;
  readonly getInventorySaveCount: () => number;
  readonly getInventoryListCount: () => number;
  readonly getInventoryStateListCount: () => number;
  readonly getHistoryReadCount: () => number;
  readonly getProductListCount: () => number;
  readonly getProductBarcodeReadCount: () => number;
  readonly getPurchaseDetailsReadCount: () => number;
  readonly getSalesSummaryReadCount: () => number;
  readonly getTopSellingProductReadCount: () => number;
  readonly getSaleDetailsReadCount: () => number;
  readonly getTransactionCount: () => number;
} {
  let inventorySaveCount = 0;
  let inventoryListCount = 0;
  let inventoryStateListCount = 0;
  let historyReadCount = 0;
  let productListCount = 0;
  let productBarcodeReadCount = 0;
  let purchaseDetailsReadCount = 0;
  let salesSummaryReadCount = 0;
  let topSellingProductReadCount = 0;
  let saleDetailsReadCount = 0;
  let transactionCount = 0;
  const backupSnapshotReader: BackupSnapshotReader = {
    async readSnapshot() {
      throw new Error('A use case was executed during composition.');
    },
  };
  const backupRestoreTransaction: BackupRestoreTransaction = {
    async replace() {
      throw new Error('A use case was executed during composition.');
    },
  };
  const inventoryRepository: InventoryRepository = {
    async list() {
      inventoryListCount += 1;
      return [];
    },
    async save() {
      inventorySaveCount += 1;
    },
  };
  const transactionManager: TransactionManager = {
    async runInTransaction() {
      transactionCount += 1;
      throw new Error('A use case was executed during composition.');
    },
  };
  const productRepository: ProductRepository &
    ProductManagementRepository &
    ProductBarcodeReader = {
    async findActiveByBarcode() {
      productBarcodeReadCount += 1;
      return null;
    },
    async findById() {
      return null;
    },
    async listByInventory() {
      productListCount += 1;
      return [];
    },
    async save() {},
    async update() {},
  };
  const inventoryStateRepository: InventoryStateRepository = {
    async listByInventory() {
      inventoryStateListCount += 1;
      return [];
    },
    async save() {},
    async update() {},
  };
  const salesSummaryReader: SalesSummaryReader = {
    async getSummary() {
      salesSummaryReadCount += 1;
      return {
        totalAmount: Money.zero(),
        estimatedProfit: Money.zero(),
        unitsSold: 0,
      };
    },
  };
  const topSellingProductReader: TopSellingProductReader = {
    async getTopSellingProduct() {
      topSellingProductReadCount += 1;
      return null;
    },
  };
  const historyReader: HistoryReader = {
    async listRecent() {
      historyReadCount += 1;
      return [];
    },
  };
  const saleDetailsReader: SaleDetailsReader = {
    async findById() {
      saleDetailsReadCount += 1;
      return null;
    },
  };
  const purchaseDetailsReader: PurchaseDetailsReader = {
    async findById() {
      purchaseDetailsReadCount += 1;
      return null;
    },
  };

  return {
    dependencies: {
      backupRestoreTransaction,
      backupSnapshotReader,
      clock: { now: () => 1_776_444_000_000 },
      idGenerator: { generate: () => 'test-id' },
      historyReader,
      inventoryRepository,
      inventoryStateRepository,
      productRepository,
      purchaseDetailsReader,
      saleDetailsReader,
      salesSummaryReader,
      topSellingProductReader,
      transactionManager,
    },
    getInventorySaveCount: () => inventorySaveCount,
    getInventoryListCount: () => inventoryListCount,
    getInventoryStateListCount: () => inventoryStateListCount,
    getHistoryReadCount: () => historyReadCount,
    getProductListCount: () => productListCount,
    getProductBarcodeReadCount: () => productBarcodeReadCount,
    getPurchaseDetailsReadCount: () => purchaseDetailsReadCount,
    getSalesSummaryReadCount: () => salesSummaryReadCount,
    getTopSellingProductReadCount: () => topSellingProductReadCount,
    getSaleDetailsReadCount: () => saleDetailsReadCount,
    getTransactionCount: () => transactionCount,
  };
}

test('composition exposes the application use cases and nothing else', () => {
  const { dependencies } = createDependencies();

  const services = assembleAppServices(dependencies);

  assert.deepEqual(Object.keys(services).sort(), [
    'adjustStock',
    'archiveProduct',
    'createBackup',
    'createInventory',
    'createProduct',
    'findProductByBarcode',
    'getCurrentInventory',
    'getProductDetails',
    'getPurchaseDetails',
    'getSaleDetails',
    'getSalesSummary',
    'getTopSellingProduct',
    'listHistory',
    'listProducts',
    'registerPurchase',
    'registerSale',
    'restoreBackup',
    'updateProduct',
    'voidPurchase',
    'voidSale',
  ]);
  assert.ok(services.adjustStock instanceof AdjustStockUseCase);
  assert.ok(services.archiveProduct instanceof ArchiveProductUseCase);
  assert.ok(services.createBackup instanceof CreateBackupUseCase);
  assert.ok(services.createInventory instanceof CreateInventoryUseCase);
  assert.ok(services.createProduct instanceof CreateProductUseCase);
  assert.ok(
    services.findProductByBarcode instanceof FindProductByBarcodeUseCase,
  );
  assert.ok(services.getCurrentInventory instanceof GetCurrentInventoryUseCase);
  assert.ok(services.getProductDetails instanceof GetProductDetailsUseCase);
  assert.ok(services.getPurchaseDetails instanceof GetPurchaseDetailsUseCase);
  assert.ok(services.getSaleDetails instanceof GetSaleDetailsUseCase);
  assert.ok(services.getSalesSummary instanceof GetSalesSummaryUseCase);
  assert.ok(
    services.getTopSellingProduct instanceof GetTopSellingProductUseCase,
  );
  assert.ok(services.listHistory instanceof ListHistoryUseCase);
  assert.ok(services.listProducts instanceof ListProductsUseCase);
  assert.ok(services.registerPurchase instanceof RegisterPurchaseUseCase);
  assert.ok(services.registerSale instanceof RegisterSaleUseCase);
  assert.ok(services.restoreBackup instanceof RestoreBackupUseCase);
  assert.ok(services.updateProduct instanceof UpdateProductUseCase);
  assert.ok(services.voidSale instanceof VoidSaleUseCase);
  assert.ok(services.voidPurchase instanceof VoidPurchaseUseCase);
});

test('composition performs no persistence automatically', () => {
  const {
    dependencies,
    getInventoryListCount,
    getHistoryReadCount,
    getInventoryStateListCount,
    getInventorySaveCount,
    getProductListCount,
    getPurchaseDetailsReadCount,
    getSaleDetailsReadCount,
    getSalesSummaryReadCount,
    getTopSellingProductReadCount,
    getTransactionCount,
  } = createDependencies();

  assembleAppServices(dependencies);

  assert.equal(getInventorySaveCount(), 0);
  assert.equal(getInventoryListCount(), 0);
  assert.equal(getHistoryReadCount(), 0);
  assert.equal(getInventoryStateListCount(), 0);
  assert.equal(getProductListCount(), 0);
  assert.equal(getPurchaseDetailsReadCount(), 0);
  assert.equal(getSaleDetailsReadCount(), 0);
  assert.equal(getSalesSummaryReadCount(), 0);
  assert.equal(getTopSellingProductReadCount(), 0);
  assert.equal(getTransactionCount(), 0);
});

test('product list query uses the composed read repositories', async () => {
  const { dependencies, getInventoryStateListCount, getProductListCount } =
    createDependencies();
  const services = assembleAppServices(dependencies);

  assert.deepEqual(
    await services.listProducts.execute({ inventoryId: 'inventory-123' }),
    [],
  );
  assert.equal(getInventoryStateListCount(), 1);
  assert.equal(getProductListCount(), 1);
});

test('barcode lookup uses the composed exact Product reader', async () => {
  const { dependencies, getProductBarcodeReadCount } = createDependencies();
  const services = assembleAppServices(dependencies);

  assert.equal(
    await services.findProductByBarcode.execute({
      inventoryId: 'inventory-123',
      barcode: '0012345',
    }),
    null,
  );
  assert.equal(getProductBarcodeReadCount(), 1);
});

test('product detail query uses the same composed read repositories', async () => {
  const { dependencies, getInventoryStateListCount, getProductListCount } =
    createDependencies();
  const services = assembleAppServices(dependencies);

  assert.equal(
    await services.getProductDetails.execute({
      inventoryId: 'inventory-123',
      productId: 'product-123',
    }),
    null,
  );
  assert.equal(getInventoryStateListCount(), 1);
  assert.equal(getProductListCount(), 1);
});

test('current Inventory query uses the composed repository', async () => {
  const { dependencies, getInventoryListCount } = createDependencies();
  const services = assembleAppServices(dependencies);

  assert.equal(await services.getCurrentInventory.execute(), null);
  assert.equal(getInventoryListCount(), 1);
});

test('sales summary query uses the composed reader', async () => {
  const { dependencies, getSalesSummaryReadCount } = createDependencies();
  const services = assembleAppServices(dependencies);

  await services.getSalesSummary.execute({
    inventoryId: 'inventory-123',
    fromInclusive: 1_000,
    toExclusive: 2_000,
  });

  assert.equal(getSalesSummaryReadCount(), 1);
});

test('top-selling product query uses the composed reader', async () => {
  const { dependencies, getTopSellingProductReadCount } = createDependencies();
  const services = assembleAppServices(dependencies);

  assert.equal(
    await services.getTopSellingProduct.execute({
      inventoryId: 'inventory-123',
      fromInclusive: 1_000,
      toExclusive: 2_000,
    }),
    null,
  );
  assert.equal(getTopSellingProductReadCount(), 1);
});

test('sale detail query uses the composed reader', async () => {
  const { dependencies, getSaleDetailsReadCount } = createDependencies();
  const services = assembleAppServices(dependencies);

  assert.equal(
    await services.getSaleDetails.execute({
      inventoryId: 'inventory-123',
      saleId: 'sale-123',
    }),
    null,
  );
  assert.equal(getSaleDetailsReadCount(), 1);
});

test('purchase detail query uses the composed reader', async () => {
  const { dependencies, getPurchaseDetailsReadCount } = createDependencies();
  const services = assembleAppServices(dependencies);

  assert.equal(
    await services.getPurchaseDetails.execute({
      inventoryId: 'inventory-123',
      purchaseId: 'purchase-123',
    }),
    null,
  );
  assert.equal(getPurchaseDetailsReadCount(), 1);
});

test('history query uses the composed reader', async () => {
  const { dependencies, getHistoryReadCount } = createDependencies();
  const services = assembleAppServices(dependencies);

  await services.listHistory.execute({ inventoryId: 'inventory-123' });

  assert.equal(getHistoryReadCount(), 1);
});

test('composition initialization is deferred until explicitly requested', async () => {
  let initializationCount = 0;
  const { dependencies } = createDependencies();
  const initialize = async (): Promise<AppServiceDependencies> => {
    initializationCount += 1;
    return dependencies;
  };

  assert.equal(initializationCount, 0);

  const services = await initializeAppServices(initialize);

  assert.equal(initializationCount, 1);
  assert.ok(services.createInventory instanceof CreateInventoryUseCase);
  assert.ok(services.getCurrentInventory instanceof GetCurrentInventoryUseCase);
  assert.ok(
    services.findProductByBarcode instanceof FindProductByBarcodeUseCase,
  );
  assert.ok(services.getProductDetails instanceof GetProductDetailsUseCase);
  assert.ok(services.getPurchaseDetails instanceof GetPurchaseDetailsUseCase);
  assert.ok(services.getSaleDetails instanceof GetSaleDetailsUseCase);
  assert.ok(services.getSalesSummary instanceof GetSalesSummaryUseCase);
  assert.ok(
    services.getTopSellingProduct instanceof GetTopSellingProductUseCase,
  );
  assert.ok(services.listHistory instanceof ListHistoryUseCase);
  assert.ok(services.listProducts instanceof ListProductsUseCase);
});

test('composition propagates initialization failures unchanged', async () => {
  const initializationError = new Error('migration failed');

  await assert.rejects(
    () =>
      initializeAppServices(async () => {
        throw initializationError;
      }),
    (error) => error === initializationError,
  );
});
