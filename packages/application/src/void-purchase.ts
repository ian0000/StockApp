import {
  createInventoryMovement,
  preparePurchaseReversal,
  type InventoryMovement,
  type InventoryState,
  type Purchase,
} from '@stock-app/domain';

import type { Clock, InventoryMovementIdGenerator } from './create-product';
import type { TransactionManager } from './ports';

export type VoidPurchaseNotEligibleReason =
  'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT' | 'CURRENT_STATE_MISMATCH';

export interface VoidPurchaseInput {
  readonly inventoryId: string;
  readonly purchaseId: string;
}

export type VoidPurchaseResult =
  | {
      readonly kind: 'VOIDED';
      readonly purchase: Purchase;
      readonly reversals: readonly [InventoryMovement];
    }
  | {
      readonly kind: 'ALREADY_VOIDED';
      readonly purchase: Purchase;
      readonly reversals: readonly [];
    }
  | {
      readonly kind: 'NOT_ELIGIBLE';
      readonly purchase: Purchase;
      readonly reason: VoidPurchaseNotEligibleReason;
    };

interface VoidPurchaseDependencies {
  readonly inventoryMovementIdGenerator: InventoryMovementIdGenerator;
  readonly clock: Clock;
  readonly transactionManager: TransactionManager;
}

export class PurchaseNotFoundError extends Error {
  override readonly name = 'PurchaseNotFoundError';

  constructor() {
    super('Purchase was not found in the requested inventory.');
  }
}

export class ConfirmedPurchaseHasReversalError extends Error {
  override readonly name = 'ConfirmedPurchaseHasReversalError';

  constructor() {
    super('A confirmed Purchase already has one or more reversal movements.');
  }
}

export class PurchaseVoidInconsistentDataError extends Error {
  override readonly name = 'PurchaseVoidInconsistentDataError';

  constructor(cause: unknown) {
    super('Persisted Purchase data is inconsistent and cannot be voided.', {
      cause,
    });
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

function costsEqual(
  left: InventoryState['unitCost'],
  right: InventoryState['unitCost'],
): boolean {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}

export class VoidPurchaseUseCase {
  constructor(private readonly dependencies: VoidPurchaseDependencies) {}

  async execute(input: VoidPurchaseInput): Promise<VoidPurchaseResult> {
    const inventoryId = normalizeRequiredIdentifier(
      input.inventoryId,
      'Inventory ID',
    );
    const purchaseId = normalizeRequiredIdentifier(
      input.purchaseId,
      'Purchase ID',
    );

    return this.dependencies.transactionManager.runInTransaction(
      async ({ purchaseVoidRepository }) => {
        const purchase = await purchaseVoidRepository.findPurchase(
          inventoryId,
          purchaseId,
        );

        if (purchase === null) throw new PurchaseNotFoundError();

        if (purchase.status === 'VOIDED') {
          return Object.freeze({
            kind: 'ALREADY_VOIDED' as const,
            purchase,
            reversals: Object.freeze([]) as readonly [],
          });
        }

        const originals =
          await purchaseVoidRepository.listOriginalPurchaseMovements(
            inventoryId,
            purchaseId,
          );

        if (originals.length !== 1) {
          throw new PurchaseVoidInconsistentDataError(
            new RangeError(
              'A confirmed Purchase requires exactly one original movement.',
            ),
          );
        }

        const original = originals[0]!;
        const existingReversals = await purchaseVoidRepository.listReversals(
          inventoryId,
          [original.id],
        );

        if (existingReversals.length > 0) {
          throw new ConfirmedPurchaseHasReversalError();
        }

        const candidates =
          await purchaseVoidRepository.listProductMovementsAtOrAfter({
            inventoryId,
            productId: purchase.productId,
            createdAt: original.createdAt,
          });

        if (candidates.some(({ id }) => id !== original.id)) {
          return Object.freeze({
            kind: 'NOT_ELIGIBLE' as const,
            purchase,
            reason: 'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT' as const,
          });
        }

        const stateRecords =
          await purchaseVoidRepository.listInventoryStates(inventoryId);
        const currentRecord = stateRecords.find(
          (record) =>
            record.inventoryId === inventoryId &&
            record.productId === purchase.productId,
        );

        if (
          currentRecord === undefined ||
          currentRecord.state.stock !== purchase.stockAfter ||
          !costsEqual(currentRecord.state.unitCost, purchase.averageCostAfter)
        ) {
          return Object.freeze({
            kind: 'NOT_ELIGIBLE' as const,
            purchase,
            reason: 'CURRENT_STATE_MISMATCH' as const,
          });
        }

        const timestamp = this.dependencies.clock.now();
        let plan;

        try {
          plan = preparePurchaseReversal({
            purchase,
            originalMovement: original,
            currentInventoryState: currentRecord.state,
            voidedAt: timestamp,
          });
        } catch (error) {
          throw new PurchaseVoidInconsistentDataError(error);
        }

        if (plan.kind !== 'VOID_PREPARED') {
          throw new PurchaseVoidInconsistentDataError(
            new Error('Confirmed Purchase did not produce a void plan.'),
          );
        }

        const reversalSpec = plan.reversals[0];
        const reversal = createInventoryMovement({
          id: this.dependencies.inventoryMovementIdGenerator.generate(),
          inventoryId,
          productId: reversalSpec.productId,
          ...reversalSpec.movement,
          effectiveAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        await purchaseVoidRepository.saveReversal(reversal);
        await purchaseVoidRepository.updateInventoryState({
          inventoryId,
          productId: plan.inventoryStateUpdates[0].productId,
          state: plan.inventoryStateUpdates[0].state,
        });
        await purchaseVoidRepository.updatePurchase(plan.purchase);

        return Object.freeze({
          kind: 'VOIDED' as const,
          purchase: plan.purchase,
          reversals: Object.freeze([reversal]) as readonly [InventoryMovement],
        });
      },
    );
  }
}
