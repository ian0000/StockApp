import {
  applyPurchase,
  createInventoryMovement,
  createPurchase,
  createPurchaseMovement,
  Money,
  type Purchase,
} from '@stock-app/domain';

import type { Clock, InventoryMovementIdGenerator } from './create-product';
import type { TransactionManager } from './ports';

export interface PurchaseIdGenerator {
  generate(): string;
}

export interface RegisterPurchaseInput {
  readonly inventoryId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitCost: Money;
  readonly notes?: string | null;
}

interface RegisterPurchaseDependencies {
  readonly purchaseIdGenerator: PurchaseIdGenerator;
  readonly inventoryMovementIdGenerator: InventoryMovementIdGenerator;
  readonly clock: Clock;
  readonly transactionManager: TransactionManager;
}

export class PurchaseProductUnavailableError extends Error {
  override readonly name = 'PurchaseProductUnavailableError';

  constructor(readonly productId: string) {
    super(`Product ${productId} is unavailable for this purchase.`);
  }
}

export class MissingPurchaseInventoryStateError extends Error {
  override readonly name = 'MissingPurchaseInventoryStateError';

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
  productId,
  quantity,
  unitCost,
  notes,
}: RegisterPurchaseInput): RegisterPurchaseInput {
  if (!Number.isSafeInteger(quantity)) {
    throw new RangeError('Purchase quantity must be a safe integer.');
  }

  if (quantity <= 0) {
    throw new RangeError('Purchase quantity must be greater than zero.');
  }

  if (!(unitCost instanceof Money)) {
    throw new TypeError('Purchase unit cost must be Money.');
  }

  if (unitCost.compare(Money.zero()) < 0) {
    throw new RangeError('Purchase unit cost must not be negative.');
  }

  return Object.freeze({
    inventoryId: normalizeRequiredIdentifier(inventoryId, 'Inventory ID'),
    productId: normalizeRequiredIdentifier(productId, 'Product ID'),
    quantity,
    unitCost,
    notes,
  });
}

export class RegisterPurchaseUseCase {
  constructor(private readonly dependencies: RegisterPurchaseDependencies) {}

  async execute(input: RegisterPurchaseInput): Promise<Purchase> {
    const normalized = validateAndNormalizeInput(input);

    return this.dependencies.transactionManager.runInTransaction(
      async (repositories) => {
        const products = await repositories.productRepository.listByInventory(
          normalized.inventoryId,
        );
        const product = products.find(({ id }) => id === normalized.productId);

        if (
          product === undefined ||
          product.inventoryId !== normalized.inventoryId ||
          product.isArchived
        ) {
          throw new PurchaseProductUnavailableError(normalized.productId);
        }

        const stateRecords =
          await repositories.inventoryStateRepository.listByInventory(
            normalized.inventoryId,
          );
        const matchingStates = stateRecords.filter(
          ({ inventoryId, productId }) =>
            inventoryId === normalized.inventoryId &&
            productId === normalized.productId,
        );

        if (matchingStates.length === 0) {
          throw new MissingPurchaseInventoryStateError(normalized.productId);
        }

        if (matchingStates.length !== 1) {
          throw new Error(
            `Expected exactly one InventoryState for Product ${normalized.productId}.`,
          );
        }

        const currentState = matchingStates[0]?.state;

        if (currentState === undefined) {
          throw new MissingPurchaseInventoryStateError(normalized.productId);
        }

        const resultingState = applyPurchase({
          inventory: currentState,
          quantity: normalized.quantity,
          unitCost: normalized.unitCost,
        });
        const averageCostAfter = resultingState.unitCost;

        if (averageCostAfter === null) {
          throw new Error('Purchase resulting cost unexpectedly missing.');
        }

        const purchaseId = this.dependencies.purchaseIdGenerator.generate();
        const timestamp = this.dependencies.clock.now();
        const purchase = createPurchase({
          id: purchaseId,
          inventoryId: normalized.inventoryId,
          productId: normalized.productId,
          quantity: normalized.quantity,
          unitCost: normalized.unitCost,
          totalAmount: normalized.unitCost.multiplyByInteger(
            normalized.quantity,
          ),
          effectiveAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
          status: 'CONFIRMED',
          notes: normalized.notes,
          averageCostBefore: currentState.unitCost,
          averageCostAfter,
          stockBefore: currentState.stock,
          stockAfter: resultingState.stock,
        });
        const movementDraft = createPurchaseMovement({
          purchaseId,
          quantity: normalized.quantity,
          unitCost: normalized.unitCost,
          stockBefore: currentState.stock,
        });
        const movement = createInventoryMovement({
          id: this.dependencies.inventoryMovementIdGenerator.generate(),
          inventoryId: normalized.inventoryId,
          productId: normalized.productId,
          ...movementDraft,
          effectiveAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        await repositories.purchaseRepository.save(purchase);
        await repositories.inventoryMovementRepository.save(movement);
        await repositories.inventoryStateRepository.update({
          inventoryId: normalized.inventoryId,
          productId: normalized.productId,
          state: resultingState,
        });

        return purchase;
      },
    );
  }
}
