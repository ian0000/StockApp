import type {
  InventoryMovement,
  InventoryState,
  Product,
} from '@stock-app/domain';

export interface ProductRepository {
  save(product: Product): Promise<void>;
}

export interface SaveInventoryInput {
  readonly inventoryId: string;
  readonly productId: string;
  readonly state: InventoryState;
}

export interface InventoryRepository {
  save(input: SaveInventoryInput): Promise<void>;
}

export interface SaveInventoryMovementInput {
  readonly inventoryId: string;
  readonly productId: string;
  readonly movement: InventoryMovement;
}

export interface InventoryMovementRepository {
  save(input: SaveInventoryMovementInput): Promise<void>;
}

export interface TransactionManager {
  /** Runs the operation within one all-or-nothing transaction. */
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
}
