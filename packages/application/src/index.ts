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
  type InventoryRepository,
  type InventoryMovementRepository,
  type InventoryStateRepository,
  type ProductRepository,
  type SaveInventoryStateInput,
  type TransactionManager,
  type TransactionRepositories,
} from './ports';
