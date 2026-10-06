import {
  CreateProductUseCase,
  RegisterSaleUseCase,
  RegisterPurchaseUseCase,
  AdjustStockUseCase,
  type CreateProductInput,
  type RegisterSaleInput,
  type RegisterPurchaseInput,
  type AdjustStockInput,
  type Clock,
  type ProductIdGenerator,
  type InventoryMovementIdGenerator,
  type SaleIdGenerator,
  type SaleItemIdGenerator,
  type PurchaseIdGenerator,
  type StockAdjustmentIdGenerator,
  type TransactionManager,
} from '../../src/index';

// Existing financial regression fixtures now act as callers. They prepare local IDs/time
// before entering the strict Application cases; explicit-identity.test exercises those cases directly.
type LocalTimes = 'occurredAt' | 'createdAt';
export type CreateProductFixtureInput = Omit<
  CreateProductInput,
  LocalTimes | 'productId' | 'initialMovementId'
>;
export type RegisterPurchaseFixtureInput = Omit<
  RegisterPurchaseInput,
  LocalTimes | 'purchaseId' | 'movementId'
>;
export type AdjustStockFixtureInput = Omit<
  AdjustStockInput,
  LocalTimes | 'stockAdjustmentId' | 'movementId'
>;
export type RegisterSaleFixtureInput = Omit<
  RegisterSaleInput,
  LocalTimes | 'saleId' | 'items'
> & {
  readonly items: readonly Omit<
    RegisterSaleInput['items'][number],
    'saleItemId' | 'movementId'
  >[];
};
interface CallerDependencies {
  readonly clock: Clock;
  readonly transactionManager: TransactionManager;
  readonly inventoryMovementIdGenerator: InventoryMovementIdGenerator;
}
export class CreateProductFixtureCaller {
  constructor(
    private readonly caller: CallerDependencies & {
      readonly productIdGenerator: ProductIdGenerator;
    },
  ) {}
  execute(input: CreateProductFixtureInput) {
    const productId = this.caller.productIdGenerator.generate();
    const now = this.caller.clock.now();
    return new CreateProductUseCase({
      transactionManager: this.caller.transactionManager,
    }).execute({
      ...input,
      productId,
      initialMovementId:
        input.initialStock > 0
          ? this.caller.inventoryMovementIdGenerator.generate()
          : null,
      occurredAt: now,
      createdAt: now,
    });
  }
}
export class RegisterSaleFixtureCaller {
  constructor(
    private readonly caller: CallerDependencies & {
      readonly saleIdGenerator: SaleIdGenerator;
      readonly saleItemIdGenerator: SaleItemIdGenerator;
    },
  ) {}
  execute(input: RegisterSaleFixtureInput) {
    const now = this.caller.clock.now();
    return new RegisterSaleUseCase({
      transactionManager: this.caller.transactionManager,
    }).execute({
      ...input,
      saleId: this.caller.saleIdGenerator.generate(),
      occurredAt: now,
      createdAt: now,
      items: input.items.map((item) => ({
        ...item,
        saleItemId: this.caller.saleItemIdGenerator.generate(),
        movementId: this.caller.inventoryMovementIdGenerator.generate(),
      })),
    });
  }
}
export class RegisterPurchaseFixtureCaller {
  constructor(
    private readonly caller: CallerDependencies & {
      readonly purchaseIdGenerator: PurchaseIdGenerator;
    },
  ) {}
  execute(input: RegisterPurchaseFixtureInput) {
    const now = this.caller.clock.now();
    return new RegisterPurchaseUseCase({
      transactionManager: this.caller.transactionManager,
    }).execute({
      ...input,
      purchaseId: this.caller.purchaseIdGenerator.generate(),
      movementId: this.caller.inventoryMovementIdGenerator.generate(),
      occurredAt: now,
      createdAt: now,
    });
  }
}
export class AdjustStockFixtureCaller {
  constructor(
    private readonly caller: CallerDependencies & {
      readonly stockAdjustmentIdGenerator: StockAdjustmentIdGenerator;
    },
  ) {}
  execute(input: AdjustStockFixtureInput) {
    const now = this.caller.clock.now();
    return new AdjustStockUseCase({
      transactionManager: this.caller.transactionManager,
    }).execute({
      ...input,
      stockAdjustmentId: this.caller.stockAdjustmentIdGenerator.generate(),
      movementId: this.caller.inventoryMovementIdGenerator.generate(),
      occurredAt: now,
      createdAt: now,
    });
  }
}
