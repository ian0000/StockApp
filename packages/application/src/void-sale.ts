import {
  createInventoryMovement,
  prepareSaleReversal,
  type InventoryMovement,
  type InventoryState,
  type Sale,
} from '@stock-app/domain';

import type { Clock, InventoryMovementIdGenerator } from './create-product';
import type { InventoryStateRecord, TransactionManager } from './ports';

export type VoidSaleNotEligibleReason =
  'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT' | 'CURRENT_STATE_MISMATCH';

export interface VoidSaleInput {
  readonly inventoryId: string;
  readonly saleId: string;
}

export type VoidSaleResult =
  | {
      readonly kind: 'VOIDED';
      readonly sale: Sale;
      readonly reversals: readonly InventoryMovement[];
    }
  | {
      readonly kind: 'ALREADY_VOIDED';
      readonly sale: Sale;
      readonly reversals: readonly [];
    }
  | {
      readonly kind: 'NOT_ELIGIBLE';
      readonly sale: Sale;
      readonly reason: VoidSaleNotEligibleReason;
    };

interface VoidSaleDependencies {
  readonly inventoryMovementIdGenerator: InventoryMovementIdGenerator;
  readonly clock: Clock;
  readonly transactionManager: TransactionManager;
}

export class SaleNotFoundError extends Error {
  override readonly name = 'SaleNotFoundError';

  constructor() {
    super('Sale was not found in the requested inventory.');
  }
}

export class ConfirmedSaleHasReversalError extends Error {
  override readonly name = 'ConfirmedSaleHasReversalError';

  constructor() {
    super('A confirmed Sale already has one or more reversal movements.');
  }
}

export class SaleVoidInconsistentDataError extends Error {
  override readonly name = 'SaleVoidInconsistentDataError';

  constructor(cause: unknown) {
    super('Persisted Sale data is inconsistent and cannot be voided.', {
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

function statesMatchOriginalMovements(
  inventoryId: string,
  originals: readonly InventoryMovement[],
  records: readonly InventoryStateRecord[],
): boolean {
  const states = new Map(
    records
      .filter((record) => record.inventoryId === inventoryId)
      .map((record) => [record.productId, record.state] as const),
  );

  if (states.size < originals.length) return false;

  return originals.every((movement) => {
    const state = states.get(movement.productId);
    return (
      state !== undefined &&
      state.stock === movement.stockAfter &&
      costsEqual(state.unitCost, movement.unitCostSnapshot)
    );
  });
}

export class VoidSaleUseCase {
  constructor(private readonly dependencies: VoidSaleDependencies) {}

  async execute(input: VoidSaleInput): Promise<VoidSaleResult> {
    const inventoryId = normalizeRequiredIdentifier(
      input.inventoryId,
      'Inventory ID',
    );
    const saleId = normalizeRequiredIdentifier(input.saleId, 'Sale ID');

    return this.dependencies.transactionManager.runInTransaction(
      async ({ saleVoidRepository }) => {
        const sale = await saleVoidRepository.findSale(inventoryId, saleId);

        if (sale === null) throw new SaleNotFoundError();

        if (sale.status === 'VOIDED') {
          const plan = prepareSaleReversal({
            sale,
            saleItems: [],
            originalMovements: [],
            currentInventoryStates: [],
            voidedAt: sale.updatedAt,
          });

          if (plan.kind !== 'ALREADY_VOIDED') {
            throw new SaleVoidInconsistentDataError(
              new Error(
                'VOIDED Sale did not produce the idempotent Domain plan.',
              ),
            );
          }

          return Object.freeze({
            kind: 'ALREADY_VOIDED' as const,
            sale: plan.sale,
            reversals: Object.freeze([]) as readonly [],
          });
        }

        const saleItems = await saleVoidRepository.listSaleItems(saleId);
        const originals = await saleVoidRepository.listOriginalSaleMovements(
          inventoryId,
          saleId,
        );
        const originalIds = originals.map(({ id }) => id);
        const existingReversals = await saleVoidRepository.listReversals(
          inventoryId,
          originalIds,
        );

        if (existingReversals.length > 0) {
          throw new ConfirmedSaleHasReversalError();
        }

        for (const original of originals) {
          const candidates =
            await saleVoidRepository.listProductMovementsAtOrAfter({
              inventoryId,
              productId: original.productId,
              createdAt: original.createdAt,
            });

          if (candidates.some(({ id }) => id !== original.id)) {
            return Object.freeze({
              kind: 'NOT_ELIGIBLE' as const,
              sale,
              reason: 'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT' as const,
            });
          }
        }

        const stateRecords =
          await saleVoidRepository.listInventoryStates(inventoryId);

        if (
          !statesMatchOriginalMovements(inventoryId, originals, stateRecords)
        ) {
          return Object.freeze({
            kind: 'NOT_ELIGIBLE' as const,
            sale,
            reason: 'CURRENT_STATE_MISMATCH' as const,
          });
        }

        const timestamp = this.dependencies.clock.now();
        let plan;

        try {
          plan = prepareSaleReversal({
            sale,
            saleItems,
            originalMovements: originals,
            currentInventoryStates: originals.map((movement) => {
              const record = stateRecords.find(
                (candidate) =>
                  candidate.inventoryId === inventoryId &&
                  candidate.productId === movement.productId,
              );

              if (record === undefined) {
                throw new RangeError(
                  'Complete current inventory state set is required.',
                );
              }

              return Object.freeze({
                productId: movement.productId,
                state: record.state,
              });
            }),
            voidedAt: timestamp,
          });
        } catch (error) {
          throw new SaleVoidInconsistentDataError(error);
        }

        if (plan.kind !== 'VOID_PREPARED') {
          throw new SaleVoidInconsistentDataError(
            new Error('Confirmed Sale did not produce a void plan.'),
          );
        }

        const reversals = Object.freeze(
          plan.reversals.map(({ productId, movement }) =>
            createInventoryMovement({
              id: this.dependencies.inventoryMovementIdGenerator.generate(),
              inventoryId,
              productId,
              ...movement,
              effectiveAt: timestamp,
              createdAt: timestamp,
              updatedAt: timestamp,
            }),
          ),
        );

        for (const reversal of reversals) {
          await saleVoidRepository.saveReversal(reversal);
        }

        for (const update of plan.inventoryStateUpdates) {
          await saleVoidRepository.updateInventoryState({
            inventoryId,
            productId: update.productId,
            state: update.state,
          });
        }

        await saleVoidRepository.updateSale(plan.sale);

        return Object.freeze({
          kind: 'VOIDED' as const,
          sale: plan.sale,
          reversals,
        });
      },
    );
  }
}
