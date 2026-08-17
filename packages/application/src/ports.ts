import type {
  InventoryMovement,
  InventoryState,
  Product,
} from '@stock-app/domain';

export interface ProductRepository {
  save(product: Product): Promise<void>;
}

export interface SaveInventoryStateInput {
  readonly inventoryId: string;
  readonly productId: string;
  readonly state: InventoryState;
}

export interface InventoryStateRepository {
  save(input: SaveInventoryStateInput): Promise<void>;
}

export interface InventoryMovementRepository {
  save(movement: InventoryMovement): Promise<void>;
}

export interface TransactionRepositories {
  readonly productRepository: ProductRepository;
  readonly inventoryStateRepository: InventoryStateRepository;
  readonly inventoryMovementRepository: InventoryMovementRepository;
}

export interface TransactionManager {
  /** Runs the operation within one all-or-nothing transaction. */
  runInTransaction<T>(
    operation: (repositories: TransactionRepositories) => Promise<T>,
  ): Promise<T>;
}
