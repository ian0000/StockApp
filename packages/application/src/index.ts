export {
  CreateProductUseCase,
  type CreateProductInput,
  type CreateProductResult,
  type Clock,
  type InventoryMovementIdGenerator,
  type ProductIdGenerator,
} from './create-product';
export {
  type InventoryMovementRepository,
  type InventoryStateRepository,
  type ProductRepository,
  type SaveInventoryStateInput,
  type TransactionManager,
  type TransactionRepositories,
} from './ports';
