import {
  AdjustStockUseCase,
  ArchiveProductUseCase,
  CreateInventoryUseCase,
  CreateProductUseCase,
  FindProductByBarcodeUseCase,
  GetCurrentInventoryUseCase,
  GetProductDetailsUseCase,
  GetPurchaseDetailsUseCase,
  GetSaleDetailsUseCase,
  GetSalesSummaryUseCase,
  ListHistoryUseCase,
  ListProductsUseCase,
  RegisterPurchaseUseCase,
  RegisterSaleUseCase,
  UpdateProductUseCase,
  VoidSaleUseCase,
  VoidPurchaseUseCase,
  type Clock,
  type HistoryReader,
  type InventoryIdGenerator,
  type InventoryMovementIdGenerator,
  type InventoryRepository,
  type InventoryStateRepository,
  type ProductIdGenerator,
  type ProductBarcodeReader,
  type ProductManagementRepository,
  type ProductRepository,
  type PurchaseIdGenerator,
  type PurchaseDetailsReader,
  type SalesSummaryReader,
  type SaleDetailsReader,
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
  readonly archiveProduct: ArchiveProductUseCase;
  readonly createInventory: CreateInventoryUseCase;
  readonly createProduct: CreateProductUseCase;
  readonly findProductByBarcode: FindProductByBarcodeUseCase;
  readonly getCurrentInventory: GetCurrentInventoryUseCase;
  readonly getProductDetails: GetProductDetailsUseCase;
  readonly getPurchaseDetails: GetPurchaseDetailsUseCase;
  readonly getSaleDetails: GetSaleDetailsUseCase;
  readonly getSalesSummary: GetSalesSummaryUseCase;
  readonly listHistory: ListHistoryUseCase;
  readonly listProducts: ListProductsUseCase;
  readonly registerPurchase: RegisterPurchaseUseCase;
  readonly registerSale: RegisterSaleUseCase;
  readonly updateProduct: UpdateProductUseCase;
  readonly voidSale: VoidSaleUseCase;
  readonly voidPurchase: VoidPurchaseUseCase;
}

export interface AppServiceDependencies {
  readonly clock: Clock;
  readonly idGenerator: AppIdGenerator;
  readonly historyReader: HistoryReader;
  readonly inventoryRepository: InventoryRepository;
  readonly inventoryStateRepository: InventoryStateRepository;
  readonly productRepository: ProductRepository &
    ProductManagementRepository &
    ProductBarcodeReader;
  readonly purchaseDetailsReader: PurchaseDetailsReader;
  readonly salesSummaryReader: SalesSummaryReader;
  readonly saleDetailsReader: SaleDetailsReader;
  readonly transactionManager: TransactionManager;
}

export function assembleAppServices({
  clock,
  idGenerator,
  historyReader,
  inventoryRepository,
  inventoryStateRepository,
  productRepository,
  purchaseDetailsReader,
  salesSummaryReader,
  saleDetailsReader,
  transactionManager,
}: AppServiceDependencies): AppServices {
  return Object.freeze({
    adjustStock: new AdjustStockUseCase({
      stockAdjustmentIdGenerator: idGenerator,
      inventoryMovementIdGenerator: idGenerator,
      clock,
      transactionManager,
    }),
    archiveProduct: new ArchiveProductUseCase({
      clock,
      productRepository,
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
    findProductByBarcode: new FindProductByBarcodeUseCase(productRepository),
    getCurrentInventory: new GetCurrentInventoryUseCase(inventoryRepository),
    getProductDetails: new GetProductDetailsUseCase({
      inventoryStateRepository,
      productRepository,
    }),
    getPurchaseDetails: new GetPurchaseDetailsUseCase(purchaseDetailsReader),
    getSaleDetails: new GetSaleDetailsUseCase(saleDetailsReader),
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
    updateProduct: new UpdateProductUseCase({
      clock,
      productRepository,
    }),
    voidSale: new VoidSaleUseCase({
      inventoryMovementIdGenerator: idGenerator,
      clock,
      transactionManager,
    }),
    voidPurchase: new VoidPurchaseUseCase({
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
