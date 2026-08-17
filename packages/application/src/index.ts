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
  type InventoryRepository,
  type ProductRepository,
  type SaveInventoryInput,
  type TransactionManager,
} from './ports';
