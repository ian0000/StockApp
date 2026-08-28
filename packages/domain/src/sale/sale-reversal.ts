import {
  createInventoryMovement,
  createInventoryMovementDraft,
  createInventoryState,
  type InventoryMovement,
  type InventoryMovementDraft,
  type InventoryState,
} from '../inventory/index';
import { createTimestampMs, type TimestampMs } from '../timestamp/index';
import { createSale, type Sale } from './sale';
import { createSaleItem, type SaleItem } from './sale-item';

export interface CurrentSaleInventoryState {
  readonly productId: string;
  readonly state: InventoryState;
}

export interface PreparedSaleReversal {
  readonly originalMovementId: string;
  readonly productId: string;
  readonly movement: InventoryMovementDraft;
}

export interface SaleInventoryStateUpdate {
  readonly productId: string;
  readonly state: InventoryState;
}

export interface PrepareSaleReversalInput {
  readonly sale: Sale;
  readonly saleItems: readonly SaleItem[];
  readonly originalMovements: readonly InventoryMovement[];
  readonly currentInventoryStates: readonly CurrentSaleInventoryState[];
  readonly voidedAt: TimestampMs;
}

export interface PreparedSaleVoidPlan {
  readonly kind: 'VOID_PREPARED';
  readonly sale: Sale;
  readonly reversals: readonly PreparedSaleReversal[];
  readonly inventoryStateUpdates: readonly SaleInventoryStateUpdate[];
}

export interface AlreadyVoidedSalePlan {
  readonly kind: 'ALREADY_VOIDED';
  readonly sale: Sale;
  readonly reversals: readonly [];
  readonly inventoryStateUpdates: readonly [];
}

export type SaleReversalPlan = PreparedSaleVoidPlan | AlreadyVoidedSalePlan;

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
  if (left === null || right === null) {
    return left === right;
  }

  return left.equals(right);
}

function validateMovement(
  movement: InventoryMovement,
  sale: Sale,
): InventoryMovement {
  const validated = createInventoryMovement(movement);

  if (validated.type !== 'SALE') {
    throw new RangeError('Original movement must have type SALE.');
  }

  if (validated.quantityDelta >= 0) {
    throw new RangeError('Sale movement quantity delta must be negative.');
  }

  if (validated.sourceType !== 'SALE' || validated.sourceId !== sale.id) {
    throw new RangeError('Movement must belong to the Sale being voided.');
  }

  if (validated.inventoryId !== sale.inventoryId) {
    throw new RangeError('Movement must belong to the Sale inventory.');
  }

  return validated;
}

function validateSaleItem(item: SaleItem, sale: Sale): SaleItem {
  const validated = createSaleItem(item);

  if (validated.saleId !== sale.id) {
    throw new RangeError('Sale item must belong to the Sale being voided.');
  }

  return validated;
}

function validateCompleteMovementSet(
  saleItems: readonly SaleItem[],
  movementsByProductId: ReadonlyMap<string, InventoryMovement>,
): void {
  if (saleItems.length !== movementsByProductId.size) {
    throw new RangeError(
      'Complete original movement set must match every Sale item.',
    );
  }

  for (const item of saleItems) {
    const movement = movementsByProductId.get(item.productId);

    if (movement === undefined) {
      throw new RangeError(
        'Complete original movement set must match every Sale item.',
      );
    }

    if (movement.quantityDelta !== -item.quantity) {
      throw new RangeError(
        'Movement quantity must match its Sale item quantity.',
      );
    }

    if (!costsEqual(movement.unitCostSnapshot, item.unitCostSnapshot)) {
      throw new RangeError(
        'Movement cost snapshot must match its Sale item cost snapshot.',
      );
    }
  }
}

function alreadyVoidedPlan(sale: Sale): AlreadyVoidedSalePlan {
  const reversals: readonly [] = Object.freeze([]);
  const inventoryStateUpdates: readonly [] = Object.freeze([]);

  return Object.freeze({
    kind: 'ALREADY_VOIDED',
    sale,
    reversals,
    inventoryStateUpdates,
  });
}

export function prepareSaleReversal({
  sale,
  saleItems,
  originalMovements,
  currentInventoryStates,
  voidedAt,
}: PrepareSaleReversalInput): SaleReversalPlan {
  createSale(sale);

  if (sale.status === 'VOIDED') {
    return alreadyVoidedPlan(sale);
  }

  if (originalMovements.length === 0) {
    throw new RangeError(
      'A confirmed Sale requires at least one original movement.',
    );
  }

  const movementsByProductId = new Map<string, InventoryMovement>();
  const movementIds = new Set<string>();

  for (const movement of originalMovements) {
    const validated = validateMovement(movement, sale);

    if (movementIds.has(validated.id)) {
      throw new RangeError('Duplicate original movement is not allowed.');
    }

    if (movementsByProductId.has(validated.productId)) {
      throw new RangeError(
        'Duplicate original movement product is not allowed.',
      );
    }

    movementIds.add(validated.id);
    movementsByProductId.set(validated.productId, validated);
  }

  const validatedSaleItems: SaleItem[] = [];
  const saleItemIds = new Set<string>();
  const saleItemProductIds = new Set<string>();

  for (const item of saleItems) {
    const validated = validateSaleItem(item, sale);

    if (saleItemIds.has(validated.id)) {
      throw new RangeError('Duplicate Sale item is not allowed.');
    }

    if (saleItemProductIds.has(validated.productId)) {
      throw new RangeError('Duplicate Sale item product is not allowed.');
    }

    saleItemIds.add(validated.id);
    saleItemProductIds.add(validated.productId);
    validatedSaleItems.push(validated);
  }

  validateCompleteMovementSet(validatedSaleItems, movementsByProductId);

  const statesByProductId = new Map<string, InventoryState>();

  for (const current of currentInventoryStates) {
    const productId = normalizeRequiredIdentifier(
      current.productId,
      'Inventory state product ID',
    );

    if (statesByProductId.has(productId)) {
      throw new RangeError('Duplicate current inventory state is not allowed.');
    }

    statesByProductId.set(productId, createInventoryState(current.state));
  }

  if (statesByProductId.size !== movementsByProductId.size) {
    throw new RangeError(
      'Complete current inventory state set must match every Sale movement.',
    );
  }

  const reversals: PreparedSaleReversal[] = [];
  const inventoryStateUpdates: SaleInventoryStateUpdate[] = [];

  for (const movement of originalMovements) {
    const validatedMovement = movementsByProductId.get(movement.productId);
    const currentState = statesByProductId.get(movement.productId);

    if (validatedMovement === undefined || currentState === undefined) {
      throw new RangeError(
        'Complete current inventory state set must match every Sale movement.',
      );
    }

    if (
      currentState.stock !== validatedMovement.stockAfter ||
      !costsEqual(currentState.unitCost, validatedMovement.unitCostSnapshot)
    ) {
      throw new RangeError(
        'Current inventory state must match the original Sale movement.',
      );
    }

    const quantityDelta = -validatedMovement.quantityDelta;
    const reversalMovement = createInventoryMovementDraft({
      type: 'REVERSAL',
      quantityDelta,
      unitCostSnapshot: validatedMovement.unitCostSnapshot,
      stockBefore: currentState.stock,
      stockAfter: validatedMovement.stockBefore,
      sourceType: 'INVENTORY_MOVEMENT',
      sourceId: validatedMovement.id,
      metadata: null,
    });
    const resultingState = createInventoryState({
      stock: reversalMovement.stockAfter,
      unitCost: currentState.unitCost,
    });

    reversals.push(
      Object.freeze({
        originalMovementId: validatedMovement.id,
        productId: validatedMovement.productId,
        movement: reversalMovement,
      }),
    );
    inventoryStateUpdates.push(
      Object.freeze({
        productId: validatedMovement.productId,
        state: resultingState,
      }),
    );
  }

  const normalizedVoidedAt = createTimestampMs(voidedAt, 'Void timestamp');

  if (normalizedVoidedAt < sale.updatedAt) {
    throw new RangeError(
      'Void timestamp must not be before the current Sale updated at.',
    );
  }

  const voidedSale = createSale({
    ...sale,
    status: 'VOIDED',
    updatedAt: normalizedVoidedAt,
  });

  return Object.freeze({
    kind: 'VOID_PREPARED',
    sale: voidedSale,
    reversals: Object.freeze(reversals),
    inventoryStateUpdates: Object.freeze(inventoryStateUpdates),
  });
}
