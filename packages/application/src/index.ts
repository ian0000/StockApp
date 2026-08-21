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
  ListProductsUseCase,
  type ListProductsInput,
  type ProductSummary,
} from './list-products';
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
  type SaleItemRepository,
  type SaleRepository,
  type SaveInventoryStateInput,
  type TransactionManager,
  type TransactionRepositories,
  type UpdateInventoryStateInput,
} from './ports';
