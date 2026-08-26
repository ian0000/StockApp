import {
  AdjustStockUseCase,
  CreateInventoryUseCase,
  CreateProductUseCase,
  GetCurrentInventoryUseCase,
  GetSalesSummaryUseCase,
  ListHistoryUseCase,
  ListProductsUseCase,
  RegisterPurchaseUseCase,
  RegisterSaleUseCase,
  type Clock,
  type HistoryReader,
  type InventoryIdGenerator,
  type InventoryMovementIdGenerator,
  type InventoryRepository,
  type InventoryStateRepository,
  type ProductIdGenerator,
  type ProductRepository,
  type PurchaseIdGenerator,
  type SalesSummaryReader,
  type SaleIdGenerator,
  type SaleItemIdGenerator,
  type StockAdjustmentIdGenerator,
  type TransactionManager,
} from '@stock-app/application';

type AppIdGenerator = InventoryIdGenerator &
  ProductIdGenerator &
  InventoryMovementIdGenerator &
  PurchaseIdGenerator &
  SaleIdGenerator &
  SaleItemIdGenerator &
  StockAdjustmentIdGenerator;

export interface AppServices {
  readonly adjustStock: AdjustStockUseCase;
  readonly createInventory: CreateInventoryUseCase;
  readonly createProduct: CreateProductUseCase;
  readonly getCurrentInventory: GetCurrentInventoryUseCase;
  readonly getSalesSummary: GetSalesSummaryUseCase;
  readonly listHistory: ListHistoryUseCase;
  readonly listProducts: ListProductsUseCase;
  readonly registerPurchase: RegisterPurchaseUseCase;
  readonly registerSale: RegisterSaleUseCase;
}

export interface AppServiceDependencies {
  readonly clock: Clock;
  readonly idGenerator: AppIdGenerator;
  readonly historyReader: HistoryReader;
  readonly inventoryRepository: InventoryRepository;
  readonly inventoryStateRepository: InventoryStateRepository;
  readonly productRepository: ProductRepository;
  readonly salesSummaryReader: SalesSummaryReader;
  readonly transactionManager: TransactionManager;
}

export function assembleAppServices({
  clock,
  idGenerator,
  historyReader,
  inventoryRepository,
  inventoryStateRepository,
  productRepository,
  salesSummaryReader,
  transactionManager,
}: AppServiceDependencies): AppServices {
  return Object.freeze({
    adjustStock: new AdjustStockUseCase({
      stockAdjustmentIdGenerator: idGenerator,
      inventoryMovementIdGenerator: idGenerator,
      clock,
      transactionManager,
    }),
    createInventory: new CreateInventoryUseCase({
      inventoryIdGenerator: idGenerator,
      clock,
      inventoryRepository,
    }),
    createProduct: new CreateProductUseCase({
      productIdGenerator: idGenerator,
      inventoryMovementIdGenerator: idGenerator,
      clock,
      transactionManager,
    }),
    getCurrentInventory: new GetCurrentInventoryUseCase(inventoryRepository),
    getSalesSummary: new GetSalesSummaryUseCase(salesSummaryReader),
    listHistory: new ListHistoryUseCase(historyReader),
    listProducts: new ListProductsUseCase({
      inventoryStateRepository,
      productRepository,
    }),
    registerPurchase: new RegisterPurchaseUseCase({
      purchaseIdGenerator: idGenerator,
      inventoryMovementIdGenerator: idGenerator,
      clock,
      transactionManager,
    }),
    registerSale: new RegisterSaleUseCase({
      saleIdGenerator: idGenerator,
      saleItemIdGenerator: idGenerator,
      inventoryMovementIdGenerator: idGenerator,
      clock,
      transactionManager,
    }),
  });
}

export async function initializeAppServices(
  initializeDependencies: () => Promise<AppServiceDependencies>,
): Promise<AppServices> {
  return assembleAppServices(await initializeDependencies());
}
