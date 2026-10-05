import {
  AdjustStockUseCase,
  CreateProductUseCase,
  RegisterPurchaseUseCase,
  RegisterSaleUseCase,
  VoidPurchaseUseCase,
  VoidSaleUseCase,
  type AdjustStockInput,
  type CreateProductInput,
  type RegisterPurchaseInput,
  type RegisterSaleInput,
  type VoidPurchaseInput,
  type VoidSaleInput,
  type Clock,
  type SaleDetailsReader,
  type TransactionManager,
} from '@stock-app/application';

type Times = 'occurredAt' | 'createdAt';
type CreateInput = Omit<
  CreateProductInput,
  Times | 'productId' | 'initialMovementId'
>;
type PurchaseInput = Omit<
  RegisterPurchaseInput,
  Times | 'purchaseId' | 'movementId'
>;
type AdjustmentInput = Omit<
  AdjustStockInput,
  Times | 'stockAdjustmentId' | 'movementId'
>;
type SaleInput = Omit<RegisterSaleInput, Times | 'saleId' | 'items'> & {
  readonly items: readonly Omit<
    RegisterSaleInput['items'][number],
    'saleItemId' | 'movementId'
  >[];
};
type SaleVoidInput = Omit<VoidSaleInput, Times | 'reversalMovements'>;
type PurchaseVoidInput = Omit<VoidPurchaseInput, Times | 'reversalMovementId'>;

export function assembleLocalCommands({
  clock,
  idGenerator,
  transactionManager,
  saleDetailsReader,
}: {
  readonly clock: Clock;
  readonly idGenerator: { generate(): string };
  readonly transactionManager: TransactionManager;
  readonly saleDetailsReader: SaleDetailsReader;
}) {
  const createProduct = new CreateProductUseCase({ transactionManager });
  const registerPurchase = new RegisterPurchaseUseCase({ transactionManager });
  const registerSale = new RegisterSaleUseCase({ transactionManager });
  const adjustStock = new AdjustStockUseCase({ transactionManager });
  return {
    createProduct: {
      execute(input: CreateInput) {
        const productId = idGenerator.generate();
        const now = clock.now();
        return createProduct.execute({
          ...input,
          productId,
          initialMovementId:
            input.initialStock > 0 ? idGenerator.generate() : null,
          occurredAt: now,
          createdAt: now,
        });
      },
    },
    registerPurchase: {
      execute(input: PurchaseInput) {
        const now = clock.now();
        return registerPurchase.execute({
          ...input,
          purchaseId: idGenerator.generate(),
          movementId: idGenerator.generate(),
          occurredAt: now,
          createdAt: now,
        });
      },
    },
    registerSale: {
      execute(input: SaleInput) {
        const now = clock.now();
        return registerSale.execute({
          ...input,
          saleId: idGenerator.generate(),
          occurredAt: now,
          createdAt: now,
          items: input.items.map((line) => ({
            ...line,
            saleItemId: idGenerator.generate(),
            movementId: idGenerator.generate(),
          })),
        });
      },
    },
    adjustStock: {
      execute(input: AdjustmentInput) {
        const now = clock.now();
        return adjustStock.execute({
          ...input,
          stockAdjustmentId: idGenerator.generate(),
          movementId: idGenerator.generate(),
          occurredAt: now,
          createdAt: now,
        });
      },
    },
    voidSale: {
      async execute(input: SaleVoidInput) {
        // The caller identifies reversal movements by product. Application rechecks eligibility in its transaction.
        const source = await saleDetailsReader.findById(input);
        const now =
          source?.sale.status === 'CONFIRMED'
            ? clock.now()
            : (source?.sale.updatedAt ?? 0);
        const reversalMovements =
          source?.sale.status === 'CONFIRMED'
            ? source.items.map(({ item }) => ({
                productId: item.productId,
                movementId: idGenerator.generate(),
              }))
            : [];
        return new VoidSaleUseCase({
          transactionManager,
          clock: { now: () => now },
        }).execute({
          ...input,
          reversalMovements,
          occurredAt: now,
          createdAt: now,
        });
      },
    },
    voidPurchase: {
      execute(input: PurchaseVoidInput) {
        const now = clock.now();
        return new VoidPurchaseUseCase({
          transactionManager,
          clock: { now: () => now },
        }).execute({
          ...input,
          reversalMovementId: idGenerator.generate(),
          occurredAt: now,
          createdAt: now,
        });
      },
    },
  };
}
export type LocalCommandServices = ReturnType<typeof assembleLocalCommands>;
