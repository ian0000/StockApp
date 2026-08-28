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
  type RegisterPurchaseResult,
} from './register-purchase';
export {
  createPurchasePriceAnalysis,
  type PurchasePriceAnalysis,
  type PurchasePriceAnalysisInput,
} from './purchase-price-analysis';
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
  GetProductDetailsUseCase,
  type GetProductDetailsInput,
  type ProductDetails,
} from './get-product-details';
export {
  GetPurchaseDetailsUseCase,
  type GetPurchaseDetailsInput,
  type PurchaseDetails,
  type PurchaseDetailsReader,
  type PurchaseDetailsReaderInput,
  type PurchaseDetailsSource,
} from './get-purchase-details';
export {
  GetSaleDetailsUseCase,
  type GetSaleDetailsInput,
  type SaleDetails,
  type SaleDetailsItem,
  type SaleDetailsReader,
  type SaleDetailsReaderInput,
  type SaleDetailsSource,
  type SaleDetailsSourceItem,
} from './get-sale-details';
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
  ArchiveProductUseCase,
  ProductManagementUnavailableError,
  UpdateProductUseCase,
  type ArchiveProductInput,
  type UpdateProductInput,
} from './manage-product';
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
  ConfirmedSaleHasReversalError,
  SaleNotFoundError,
  SaleVoidInconsistentDataError,
  VoidSaleUseCase,
  type VoidSaleInput,
  type VoidSaleNotEligibleReason,
  type VoidSaleResult,
} from './void-sale';
export {
  type InventoryStateRecord,
  type InventoryRepository,
  type InventoryMovementRepository,
  type InventoryStateRepository,
  type ProductRepository,
  type ProductManagementRepository,
  type PurchaseRepository,
  type SaleVoidRepository,
  type SaleItemRepository,
  type SaleRepository,
  type StockAdjustmentRepository,
  type SaveInventoryStateInput,
  type TransactionManager,
  type TransactionRepositories,
  type UpdateInventoryStateInput,
  type ListProductMovementsAtOrAfterInput,
} from './ports';
