import {
  createInventoryMovement,
  createInventoryState,
  createSale,
  createSaleItem,
  Money,
  type InventoryMovement,
  type InventoryState,
  type Sale,
  type SaleItem,
} from '@stock-app/domain';

import type { Clock, InventoryMovementIdGenerator } from './create-product';
import type { TransactionManager } from './ports';

export interface SaleIdGenerator {
  generate(): string;
}

export interface SaleItemIdGenerator {
  generate(): string;
}

export interface RegisterSaleLineInput {
  readonly productId: string;
  readonly quantity: number;
  readonly unitSalePrice: Money;
}

export interface RegisterSaleInput {
  readonly inventoryId: string;
  readonly items: readonly RegisterSaleLineInput[];
  readonly notes?: string | null;
}

export interface RegisterSaleResult {
  readonly sale: Sale;
  readonly items: readonly SaleItem[];
}

interface RegisterSaleDependencies {
  readonly saleIdGenerator: SaleIdGenerator;
  readonly saleItemIdGenerator: SaleItemIdGenerator;
  readonly inventoryMovementIdGenerator: InventoryMovementIdGenerator;
  readonly clock: Clock;
  readonly transactionManager: TransactionManager;
}

interface PreparedLine {
  readonly item: SaleItem;
  readonly movement: InventoryMovement;
  readonly nextState: InventoryState;
}

export class EmptySaleError extends Error {
  override readonly name = 'EmptySaleError';

  constructor() {
    super('A sale must contain at least one item.');
  }
}

export class DuplicateSaleProductError extends Error {
  override readonly name = 'DuplicateSaleProductError';

  constructor(readonly productId: string) {
    super(`Product ${productId} appears more than once in the sale.`);
  }
}

export class SaleProductUnavailableError extends Error {
  override readonly name = 'SaleProductUnavailableError';

  constructor(readonly productId: string) {
    super(`Product ${productId} is unavailable for this sale.`);
  }
}

export class MissingInventoryStateError extends Error {
  override readonly name = 'MissingInventoryStateError';

  constructor(readonly productId: string) {
    super(`Inventory state is missing for Product ${productId}.`);
  }
}

function normalizeRequiredIdentifier(value: string, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string.`);
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }

  return normalized;
}

function validateAndNormalizeInput({
  inventoryId,
  items,
  notes,
}: RegisterSaleInput): RegisterSaleInput {
  const normalizedInventoryId = normalizeRequiredIdentifier(
    inventoryId,
    'Inventory ID',
  );

  if (items.length === 0) {
    throw new EmptySaleError();
  }

  const productIds = new Set<string>();
  const normalizedItems = items.map((item) => {
    const productId = normalizeRequiredIdentifier(item.productId, 'Product ID');

    if (productIds.has(productId)) {
      throw new DuplicateSaleProductError(productId);
    }

    productIds.add(productId);

    if (!Number.isSafeInteger(item.quantity)) {
      throw new RangeError('Sale quantity must be a safe integer.');
    }

    if (item.quantity <= 0) {
      throw new RangeError('Sale quantity must be greater than zero.');
    }

    if (item.unitSalePrice.compare(Money.zero()) <= 0) {
      throw new RangeError('Unit sale price must be greater than zero.');
    }

    return Object.freeze({ ...item, productId });
  });

  return Object.freeze({
    inventoryId: normalizedInventoryId,
    items: Object.freeze(normalizedItems),
    notes,
  });
}

function sumMoney(values: readonly Money[]): Money {
  return values.reduce((total, value) => total.add(value), Money.zero());
}

export class RegisterSaleUseCase {
  constructor(private readonly dependencies: RegisterSaleDependencies) {}

  async execute(input: RegisterSaleInput): Promise<RegisterSaleResult> {
    const normalized = validateAndNormalizeInput(input);

    return this.dependencies.transactionManager.runInTransaction(
      async (repositories) => {
        const products = await repositories.productRepository.listByInventory(
          normalized.inventoryId,
        );
        const stateRecords =
          await repositories.inventoryStateRepository.listByInventory(
            normalized.inventoryId,
          );
        const productsById = new Map(
          products.map((product) => [product.id, product] as const),
        );
        const statesByProductId = new Map(
          stateRecords
            .filter(({ inventoryId }) => inventoryId === normalized.inventoryId)
            .map(({ productId, state }) => [productId, state] as const),
        );

        for (const inputItem of normalized.items) {
          const product = productsById.get(inputItem.productId);

          if (
            product === undefined ||
            product.inventoryId !== normalized.inventoryId ||
            product.isArchived
          ) {
            throw new SaleProductUnavailableError(inputItem.productId);
          }

          if (!statesByProductId.has(inputItem.productId)) {
            throw new MissingInventoryStateError(inputItem.productId);
          }
        }

        const saleId = this.dependencies.saleIdGenerator.generate();
        const timestamp = this.dependencies.clock.now();
        const preparedLines: PreparedLine[] = normalized.items.map(
          (inputItem) => {
            const currentState = statesByProductId.get(inputItem.productId);

            if (currentState === undefined) {
              throw new MissingInventoryStateError(inputItem.productId);
            }

            const subtotal = inputItem.unitSalePrice.multiplyByInteger(
              inputItem.quantity,
            );
            const unitCostSnapshot = currentState.unitCost;
            const estimatedCost =
              unitCostSnapshot === null
                ? null
                : unitCostSnapshot.multiplyByInteger(inputItem.quantity);
            const estimatedProfit =
              estimatedCost === null ? null : subtotal.subtract(estimatedCost);
            const stockAfter = currentState.stock - inputItem.quantity;

            if (!Number.isSafeInteger(stockAfter)) {
              throw new RangeError('Resulting stock must be a safe integer.');
            }

            const item = createSaleItem({
              id: this.dependencies.saleItemIdGenerator.generate(),
              saleId,
              productId: inputItem.productId,
              quantity: inputItem.quantity,
              unitSalePrice: inputItem.unitSalePrice,
              subtotal,
              unitCostSnapshot,
              estimatedCost,
              estimatedProfit,
              costStatus: unitCostSnapshot === null ? 'UNKNOWN' : 'KNOWN',
              createdAt: timestamp,
              updatedAt: timestamp,
            });
            const movement = createInventoryMovement({
              id: this.dependencies.inventoryMovementIdGenerator.generate(),
              inventoryId: normalized.inventoryId,
              productId: inputItem.productId,
              type: 'SALE',
              quantityDelta: -inputItem.quantity,
              unitCostSnapshot,
              stockBefore: currentState.stock,
              stockAfter,
              sourceType: 'SALE',
              sourceId: saleId,
              metadata: null,
              effectiveAt: timestamp,
              createdAt: timestamp,
              updatedAt: timestamp,
            });

            return Object.freeze({
              item,
              movement,
              nextState: createInventoryState({
                stock: stockAfter,
                unitCost: currentState.unitCost,
              }),
            });
          },
        );
        const items = Object.freeze(preparedLines.map(({ item }) => item));
        const totalAmount = sumMoney(items.map(({ subtotal }) => subtotal));
        const allCostsKnown = items.every(
          ({ costStatus }) => costStatus === 'KNOWN',
        );
        const estimatedCost = allCostsKnown
          ? sumMoney(
              items.map(({ estimatedCost }) => {
                if (estimatedCost === null) {
                  throw new Error('Known SaleItem cost unexpectedly missing.');
                }

                return estimatedCost;
              }),
            )
          : null;
        const estimatedProfit = allCostsKnown
          ? sumMoney(
              items.map(({ estimatedProfit }) => {
                if (estimatedProfit === null) {
                  throw new Error(
                    'Known SaleItem profit unexpectedly missing.',
                  );
                }

                return estimatedProfit;
              }),
            )
          : null;
        const sale = createSale({
          id: saleId,
          inventoryId: normalized.inventoryId,
          effectiveAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
          status: 'CONFIRMED',
          totalAmount,
          estimatedCost,
          estimatedProfit,
          notes: normalized.notes,
        });

        await repositories.saleRepository.save(sale);

        for (const item of items) {
          await repositories.saleItemRepository.save(item);
        }

        for (const { movement } of preparedLines) {
          await repositories.inventoryMovementRepository.save(movement);
        }

        for (const { item, nextState } of preparedLines) {
          await repositories.inventoryStateRepository.update({
            inventoryId: normalized.inventoryId,
            productId: item.productId,
            state: nextState,
          });
        }

        return Object.freeze({ sale, items });
      },
    );
  }
}
