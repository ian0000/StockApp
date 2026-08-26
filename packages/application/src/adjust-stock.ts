import {
  applyStockAdjustment,
  createInventoryMovement,
  createStockAdjustment,
  Money,
  type AdjustmentCostMode,
  type AdjustmentReason,
  type InventoryState,
  type StockAdjustment,
} from '@stock-app/domain';

import type { Clock, InventoryMovementIdGenerator } from './create-product';
import type { TransactionManager } from './ports';

export interface StockAdjustmentIdGenerator {
  generate(): string;
}

export interface AdjustStockInput {
  readonly inventoryId: string;
  readonly productId: string;
  readonly actualStock: number;
  readonly reason: AdjustmentReason;
  readonly costMode?: AdjustmentCostMode | null;
  readonly customUnitCost?: Money | null;
}

export interface AdjustStockResult {
  readonly adjustment: StockAdjustment;
  readonly resultingState: InventoryState;
}

interface AdjustStockDependencies {
  readonly stockAdjustmentIdGenerator: StockAdjustmentIdGenerator;
  readonly inventoryMovementIdGenerator: InventoryMovementIdGenerator;
  readonly clock: Clock;
  readonly transactionManager: TransactionManager;
}

export class AdjustmentProductUnavailableError extends Error {
  override readonly name = 'AdjustmentProductUnavailableError';

  constructor(readonly productId: string) {
    super(`Product ${productId} is unavailable for a stock adjustment.`);
  }
}

export class MissingAdjustmentInventoryStateError extends Error {
  override readonly name = 'MissingAdjustmentInventoryStateError';

  constructor(readonly productId: string) {
    super(`Inventory state is missing for Product ${productId}.`);
  }
}

export class NoStockAdjustmentNeededError extends Error {
  override readonly name = 'NoStockAdjustmentNeededError';

  constructor(readonly productId: string) {
    super(`Product ${productId} already has the reported physical stock.`);
  }
}

export class AdjustmentCurrentCostRequiredError extends Error {
  override readonly name = 'AdjustmentCurrentCostRequiredError';

  constructor(readonly productId: string) {
    super(`Product ${productId} needs a current cost for USE_CURRENT_COST.`);
  }
}

export class InvalidAdjustmentCostModeError extends Error {
  override readonly name = 'InvalidAdjustmentCostModeError';
}

const ADJUSTMENT_REASONS: ReadonlySet<AdjustmentReason> = new Set([
  'COUNT_CORRECTION',
  'DAMAGED',
  'LOST',
  'INTERNAL_USE',
  'OTHER',
]);

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
  actualStock,
  reason,
  costMode = null,
  customUnitCost = null,
}: AdjustStockInput): Required<AdjustStockInput> {
  if (!Number.isSafeInteger(actualStock)) {
    throw new RangeError('Actual stock must be a safe integer.');
  }

  if (actualStock < 0) {
    throw new RangeError('Actual stock must be non-negative.');
  }

  if (!ADJUSTMENT_REASONS.has(reason)) {
    throw new RangeError('Adjustment reason is invalid.');
  }

  if (
    costMode !== null &&
    costMode !== 'USE_CURRENT_COST' &&
    costMode !== 'CUSTOM_COST'
  ) {
    throw new InvalidAdjustmentCostModeError(
      'Adjustment cost mode is invalid.',
    );
  }

  if (customUnitCost !== null) {
    if (!(customUnitCost instanceof Money)) {
      throw new TypeError('Custom unit cost must be Money or null.');
    }

    if (customUnitCost.compare(Money.zero()) < 0) {
      throw new RangeError('Custom unit cost must not be negative.');
    }
  }

  return Object.freeze({
    inventoryId: normalizeRequiredIdentifier(inventoryId, 'Inventory ID'),
    productId: normalizeRequiredIdentifier(productId, 'Product ID'),
    actualStock,
    reason,
    costMode,
    customUnitCost,
  });
}

function validateCostCombination(
  productId: string,
  difference: number,
  currentState: InventoryState,
  costMode: AdjustmentCostMode | null,
  customUnitCost: Money | null,
): void {
  if (difference > 0) {
    if (costMode === null) {
      throw new InvalidAdjustmentCostModeError(
        'A positive stock adjustment requires a cost mode.',
      );
    }

    if (costMode === 'USE_CURRENT_COST') {
      if (customUnitCost !== null) {
        throw new InvalidAdjustmentCostModeError(
          'USE_CURRENT_COST does not accept a custom cost.',
        );
      }

      if (currentState.unitCost === null) {
        throw new AdjustmentCurrentCostRequiredError(productId);
      }

      return;
    }

    if (customUnitCost === null) {
      throw new InvalidAdjustmentCostModeError(
        'CUSTOM_COST requires a custom cost.',
      );
    }

    return;
  }

  if (costMode !== null || customUnitCost !== null) {
    throw new InvalidAdjustmentCostModeError(
      'A negative stock adjustment does not accept cost input.',
    );
  }
}

export class AdjustStockUseCase {
  constructor(private readonly dependencies: AdjustStockDependencies) {}

  async execute(input: AdjustStockInput): Promise<AdjustStockResult> {
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
          throw new AdjustmentProductUnavailableError(normalized.productId);
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
          throw new MissingAdjustmentInventoryStateError(normalized.productId);
        }

        if (matchingStates.length !== 1) {
          throw new Error(
            `Expected exactly one InventoryState for Product ${normalized.productId}.`,
          );
        }

        const currentState = matchingStates[0]?.state;

        if (currentState === undefined) {
          throw new MissingAdjustmentInventoryStateError(normalized.productId);
        }

        const difference = normalized.actualStock - currentState.stock;

        if (!Number.isSafeInteger(difference)) {
          throw new RangeError(
            'Stock adjustment difference must be a safe integer.',
          );
        }

        if (difference === 0) {
          throw new NoStockAdjustmentNeededError(normalized.productId);
        }

        validateCostCombination(
          normalized.productId,
          difference,
          currentState,
          normalized.costMode,
          normalized.customUnitCost,
        );

        const applied = applyStockAdjustment({
          inventory: currentState,
          actualStock: normalized.actualStock,
          costMode: normalized.costMode,
          customUnitCost: normalized.customUnitCost,
        });

        if (applied.unitCost === null) {
          throw new Error(
            'Stock adjustment resolved cost unexpectedly missing.',
          );
        }

        const adjustmentId =
          this.dependencies.stockAdjustmentIdGenerator.generate();
        const movementId =
          this.dependencies.inventoryMovementIdGenerator.generate();
        const timestamp = this.dependencies.clock.now();
        const adjustment = createStockAdjustment({
          id: adjustmentId,
          inventoryId: normalized.inventoryId,
          productId: normalized.productId,
          stockBefore: currentState.stock,
          actualStock: normalized.actualStock,
          difference: applied.difference,
          reason: normalized.reason,
          costMode: applied.costMode,
          unitCost: applied.unitCost,
          effectiveAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        const movement = createInventoryMovement({
          id: movementId,
          inventoryId: normalized.inventoryId,
          productId: normalized.productId,
          type: applied.difference > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          quantityDelta: applied.difference,
          unitCostSnapshot: applied.unitCost,
          stockBefore: currentState.stock,
          stockAfter: applied.inventory.stock,
          sourceType: 'STOCK_ADJUSTMENT',
          sourceId: adjustment.id,
          metadata: null,
          effectiveAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        await repositories.stockAdjustmentRepository.save(adjustment);
        await repositories.inventoryMovementRepository.save(movement);
        await repositories.inventoryStateRepository.update({
          inventoryId: normalized.inventoryId,
          productId: normalized.productId,
          state: applied.inventory,
        });

        return Object.freeze({
          adjustment,
          resultingState: applied.inventory,
        });
      },
    );
  }
}
