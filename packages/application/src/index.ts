export {
  AdjustStockUseCase,
  AdjustmentCurrentCostRequiredError,
  AdjustmentProductUnavailableError,
  InvalidAdjustmentCostModeError,
  MissingAdjustmentInventoryStateError,
  NoStockAdjustmentNeededError,
  type AdjustStockInput,
  type AdjustStockResult,
  type StockAdjustmentIdGenerator,
} from './adjust-stock';
export {
  MissingPurchaseInventoryStateError,
  PurchaseProductUnavailableError,
  RegisterPurchaseUseCase,
  type PurchaseIdGenerator,
  type RegisterPurchaseInput,
} from './register-purchase';
export {
  CreateInventoryUseCase,
  type CreateInventoryInput,
  type InventoryIdGenerator,
} from './create-inventory';
export {
  CreateProductUseCase,
  type CreateProductInput,
  type CreateProductResult,
  type Clock,
  type InventoryMovementIdGenerator,
  type ProductIdGenerator,
} from './create-product';
export {
  GetCurrentInventoryUseCase,
  MultipleInventoriesNotSupportedError,
} from './get-current-inventory';
export {
  GetSalesSummaryUseCase,
  type GetSalesSummaryInput,
  type SalesSummary,
  type SalesSummaryReader,
} from './get-sales-summary';
export {
  ListProductsUseCase,
  type ListProductsInput,
  type ProductSummary,
} from './list-products';
export {
  compareHistoryEntriesNewestFirst,
  DEFAULT_HISTORY_LIMIT,
  ListHistoryUseCase,
  MAX_HISTORY_LIMIT,
  type HistoryEntry,
  type HistoryReader,
  type ListHistoryInput,
  type ListHistoryReaderInput,
  type PurchaseHistoryEntry,
  type SaleHistoryEntry,
  type StockAdjustmentHistoryEntry,
} from './list-history';
export {
  DuplicateSaleProductError,
  EmptySaleError,
  MissingInventoryStateError,
  RegisterSaleUseCase,
  SaleProductUnavailableError,
  type RegisterSaleInput,
  type RegisterSaleLineInput,
  type RegisterSaleResult,
  type SaleIdGenerator,
  type SaleItemIdGenerator,
} from './register-sale';
export {
  type InventoryStateRecord,
  type InventoryRepository,
  type InventoryMovementRepository,
  type InventoryStateRepository,
  type ProductRepository,
  type PurchaseRepository,
  type SaleItemRepository,
  type SaleRepository,
  type StockAdjustmentRepository,
  type SaveInventoryStateInput,
  type TransactionManager,
  type TransactionRepositories,
  type UpdateInventoryStateInput,
} from './ports';
