import type {
  Inventory,
  InventoryMovement,
  InventoryState,
  Product,
  Purchase,
  Sale,
  SaleItem,
  StockAdjustment,
  TimestampMs,
} from '@stock-app/domain';

export interface InventoryRepository {
  list(): Promise<readonly Inventory[]>;
  save(inventory: Inventory): Promise<void>;
}

export interface ProductRepository {
  listByInventory(inventoryId: string): Promise<readonly Product[]>;
  save(product: Product): Promise<void>;
}

export interface ProductManagementRepository {
  findById(inventoryId: string, productId: string): Promise<Product | null>;
  update(product: Product): Promise<void>;
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
  update(input: UpdateInventoryStateInput): Promise<void>;
}

export type UpdateInventoryStateInput = SaveInventoryStateInput;

export interface InventoryStateRecord {
  readonly inventoryId: string;
  readonly productId: string;
  readonly state: InventoryState;
}

export interface InventoryMovementRepository {
  save(movement: InventoryMovement): Promise<void>;
}

export interface PurchaseRepository {
  save(purchase: Purchase): Promise<void>;
}

export interface SaleRepository {
  save(sale: Sale): Promise<void>;
}

export interface SaleItemRepository {
  save(item: SaleItem): Promise<void>;
}

export interface StockAdjustmentRepository {
  save(adjustment: StockAdjustment): Promise<void>;
}

export interface ListProductMovementsAtOrAfterInput {
  readonly inventoryId: string;
  readonly productId: string;
  readonly createdAt: TimestampMs;
}

export interface SaleVoidRepository {
  findSale(inventoryId: string, saleId: string): Promise<Sale | null>;
  listSaleItems(saleId: string): Promise<readonly SaleItem[]>;
  listOriginalSaleMovements(
    inventoryId: string,
    saleId: string,
  ): Promise<readonly InventoryMovement[]>;
  listReversals(
    inventoryId: string,
    originalMovementIds: readonly string[],
  ): Promise<readonly InventoryMovement[]>;
  listProductMovementsAtOrAfter(
    input: ListProductMovementsAtOrAfterInput,
  ): Promise<readonly InventoryMovement[]>;
  listInventoryStates(
    inventoryId: string,
  ): Promise<readonly InventoryStateRecord[]>;
  saveReversal(movement: InventoryMovement): Promise<void>;
  updateInventoryState(input: UpdateInventoryStateInput): Promise<void>;
  updateSale(sale: Sale): Promise<void>;
}

export interface TransactionRepositories {
  readonly productRepository: ProductRepository;
  readonly inventoryStateRepository: InventoryStateRepository;
  readonly inventoryMovementRepository: InventoryMovementRepository;
  readonly purchaseRepository: PurchaseRepository;
  readonly saleRepository: SaleRepository;
  readonly saleItemRepository: SaleItemRepository;
  readonly stockAdjustmentRepository: StockAdjustmentRepository;
  readonly saleVoidRepository: SaleVoidRepository;
}

export interface TransactionManager {
  /** Runs the operation within one all-or-nothing transaction. */
  runInTransaction<T>(
    operation: (repositories: TransactionRepositories) => Promise<T>,
  ): Promise<T>;
}
