import {
  CreateInventoryUseCase,
  CreateProductUseCase,
  GetCurrentInventoryUseCase,
  ListProductsUseCase,
  RegisterSaleUseCase,
  type Clock,
  type InventoryIdGenerator,
  type InventoryMovementIdGenerator,
  type InventoryRepository,
  type InventoryStateRepository,
  type ProductIdGenerator,
  type ProductRepository,
  type SaleIdGenerator,
  type SaleItemIdGenerator,
  type TransactionManager,
} from '@stock-app/application';

type AppIdGenerator = InventoryIdGenerator &
  ProductIdGenerator &
  InventoryMovementIdGenerator &
  SaleIdGenerator &
  SaleItemIdGenerator;

export interface AppServices {
  readonly createInventory: CreateInventoryUseCase;
  readonly createProduct: CreateProductUseCase;
  readonly getCurrentInventory: GetCurrentInventoryUseCase;
  readonly listProducts: ListProductsUseCase;
  readonly registerSale: RegisterSaleUseCase;
}

export interface AppServiceDependencies {
  readonly clock: Clock;
  readonly idGenerator: AppIdGenerator;
  readonly inventoryRepository: InventoryRepository;
  readonly inventoryStateRepository: InventoryStateRepository;
  readonly productRepository: ProductRepository;
  readonly transactionManager: TransactionManager;
}

export function assembleAppServices({
  clock,
  idGenerator,
  inventoryRepository,
  inventoryStateRepository,
  productRepository,
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
    listProducts: new ListProductsUseCase({
      inventoryStateRepository,
      productRepository,
    }),
    registerSale: new RegisterSaleUseCase({
      saleIdGenerator: idGenerator,
      saleItemIdGenerator: idGenerator,
      inventoryMovementIdGenerator: idGenerator,
      clock,
      transactionManager,
    }),
  });
}

export async function initializeAppServices(
  initializeDependencies: () => Promise<AppServiceDependencies>,
): Promise<AppServices> {
  return assembleAppServices(await initializeDependencies());
}
