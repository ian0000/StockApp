import type {
  Inventory,
  InventoryMovement,
  InventoryState,
  Product,
} from '@stock-app/domain';

export interface InventoryRepository {
  list(): Promise<readonly Inventory[]>;
  save(inventory: Inventory): Promise<void>;
}

export interface ProductRepository {
  listByInventory(inventoryId: string): Promise<readonly Product[]>;
  save(product: Product): Promise<void>;
}

export interface SaveInventoryStateInput {
  readonly inventoryId: string;
  readonly productId: string;
  readonly state: InventoryState;
}

export interface InventoryStateRepository {
  listByInventory(
    inventoryId: string,
  ): Promise<readonly InventoryStateRecord[]>;
  save(input: SaveInventoryStateInput): Promise<void>;
}

export interface InventoryStateRecord {
  readonly inventoryId: string;
  readonly productId: string;
  readonly state: InventoryState;
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
