import {
  CreateInventoryUseCase,
  CreateProductUseCase,
  GetCurrentInventoryUseCase,
  type Clock,
  type InventoryIdGenerator,
  type InventoryMovementIdGenerator,
  type InventoryRepository,
  type ProductIdGenerator,
  type TransactionManager,
} from '@stock-app/application';

type AppIdGenerator = InventoryIdGenerator &
  ProductIdGenerator &
  InventoryMovementIdGenerator;

export interface AppServices {
  readonly createInventory: CreateInventoryUseCase;
  readonly createProduct: CreateProductUseCase;
  readonly getCurrentInventory: GetCurrentInventoryUseCase;
}

export interface AppServiceDependencies {
  readonly clock: Clock;
  readonly idGenerator: AppIdGenerator;
  readonly inventoryRepository: InventoryRepository;
  readonly transactionManager: TransactionManager;
}

export function assembleAppServices({
  clock,
  idGenerator,
  inventoryRepository,
  transactionManager,
}: AppServiceDependencies): AppServices {
  return Object.freeze({
    createInventory: new CreateInventoryUseCase({
      inventoryIdGenerator: idGenerator,
      clock,
      inventoryRepository,
    }),
    createProduct: new CreateProductUseCase({
      productIdGenerator: idGenerator,
      inventoryMovementIdGenerator: idGenerator,
      clock,
      transactionManager,
    }),
    getCurrentInventory: new GetCurrentInventoryUseCase(inventoryRepository),
  });
}

export async function initializeAppServices(
  initializeDependencies: () => Promise<AppServiceDependencies>,
): Promise<AppServices> {
  return assembleAppServices(await initializeDependencies());
}
