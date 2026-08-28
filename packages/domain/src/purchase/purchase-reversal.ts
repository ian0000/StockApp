import {
  createInventoryMovement,
  createInventoryMovementDraft,
  createInventoryState,
  type InventoryMovement,
  type InventoryMovementDraft,
  type InventoryState,
} from '../inventory/index';
import { createTimestampMs, type TimestampMs } from '../timestamp/index';
import { createPurchase, type Purchase } from './purchase';

export interface PreparedPurchaseReversal {
  readonly originalMovementId: string;
  readonly productId: string;
  readonly movement: InventoryMovementDraft;
}

export interface PurchaseInventoryStateUpdate {
  readonly productId: string;
  readonly state: InventoryState;
}

export interface PreparePurchaseReversalInput {
  readonly purchase: Purchase;
  readonly originalMovement: InventoryMovement;
  readonly currentInventoryState: InventoryState;
  readonly voidedAt: TimestampMs;
}

export interface PreparedPurchaseVoidPlan {
  readonly kind: 'VOID_PREPARED';
  readonly purchase: Purchase;
  readonly reversals: readonly [PreparedPurchaseReversal];
  readonly inventoryStateUpdates: readonly [PurchaseInventoryStateUpdate];
}

export interface AlreadyVoidedPurchasePlan {
  readonly kind: 'ALREADY_VOIDED';
  readonly purchase: Purchase;
  readonly reversals: readonly [];
  readonly inventoryStateUpdates: readonly [];
}

export type PurchaseReversalPlan =
  PreparedPurchaseVoidPlan | AlreadyVoidedPurchasePlan;

function costsEqual(
  left: InventoryState['unitCost'],
  right: InventoryState['unitCost'],
): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.equals(right);
}

function validateOriginalMovement(
  movement: InventoryMovement,
  purchase: Purchase,
): InventoryMovement {
  const validated = createInventoryMovement(movement);

  if (validated.type !== 'PURCHASE') {
    throw new RangeError('Original movement must have type PURCHASE.');
  }

  if (validated.quantityDelta <= 0) {
    throw new RangeError('Purchase movement quantity delta must be positive.');
  }

  if (
    validated.sourceType !== 'PURCHASE' ||
    validated.sourceId !== purchase.id
  ) {
    throw new RangeError('Movement must belong to the Purchase being voided.');
  }

  if (validated.inventoryId !== purchase.inventoryId) {
    throw new RangeError('Movement must belong to the Purchase inventory.');
  }

  if (validated.productId !== purchase.productId) {
    throw new RangeError('Movement must belong to the Purchase product.');
  }

  if (validated.quantityDelta !== purchase.quantity) {
    throw new RangeError('Movement quantity must match the Purchase quantity.');
  }

  if (validated.stockBefore !== purchase.stockBefore) {
    throw new RangeError(
      'Movement stock before must match Purchase stock before.',
    );
  }

  if (validated.stockAfter !== purchase.stockAfter) {
    throw new RangeError(
      'Movement stock after must match Purchase stock after.',
    );
  }

  if (!costsEqual(validated.unitCostSnapshot, purchase.unitCost)) {
    throw new RangeError(
      'Movement cost snapshot must match Purchase unit cost.',
    );
  }

  return validated;
}

function alreadyVoidedPlan(purchase: Purchase): AlreadyVoidedPurchasePlan {
  const reversals: readonly [] = Object.freeze([]);
  const inventoryStateUpdates: readonly [] = Object.freeze([]);

  return Object.freeze({
    kind: 'ALREADY_VOIDED',
    purchase,
    reversals,
    inventoryStateUpdates,
  });
}

export function preparePurchaseReversal({
  purchase,
  originalMovement,
  currentInventoryState,
  voidedAt,
}: PreparePurchaseReversalInput): PurchaseReversalPlan {
  createPurchase(purchase);

  if (purchase.status === 'VOIDED') {
    return alreadyVoidedPlan(purchase);
  }

  const validatedMovement = validateOriginalMovement(
    originalMovement,
    purchase,
  );
  const validatedCurrentState = createInventoryState(currentInventoryState);

  if (
    validatedCurrentState.stock !== purchase.stockAfter ||
    !costsEqual(validatedCurrentState.unitCost, purchase.averageCostAfter)
  ) {
    throw new RangeError(
      'Current inventory state must match the Purchase after snapshots.',
    );
  }

  const quantityDelta = -validatedMovement.quantityDelta;

  if (!Number.isSafeInteger(quantityDelta)) {
    throw new RangeError('Reversal quantity delta must be a safe integer.');
  }

  const reversalMovement = createInventoryMovementDraft({
    type: 'REVERSAL',
    quantityDelta,
    unitCostSnapshot: validatedMovement.unitCostSnapshot,
    stockBefore: validatedCurrentState.stock,
    stockAfter: purchase.stockBefore,
    sourceType: 'INVENTORY_MOVEMENT',
    sourceId: validatedMovement.id,
    metadata: null,
  });
  const restoredState = createInventoryState({
    stock: purchase.stockBefore,
    unitCost: purchase.averageCostBefore,
  });
  const normalizedVoidedAt = createTimestampMs(
    voidedAt,
    'Purchase void timestamp',
  );

  if (normalizedVoidedAt < purchase.updatedAt) {
    throw new RangeError(
      'Void timestamp must not be before the current Purchase updated at.',
    );
  }

  const voidedPurchase = createPurchase({
    ...purchase,
    status: 'VOIDED',
    updatedAt: normalizedVoidedAt,
  });
  const reversals: readonly [PreparedPurchaseReversal] = Object.freeze([
    Object.freeze({
      originalMovementId: validatedMovement.id,
      productId: validatedMovement.productId,
      movement: reversalMovement,
    }),
  ]);
  const inventoryStateUpdates: readonly [PurchaseInventoryStateUpdate] =
    Object.freeze([
      Object.freeze({
        productId: validatedMovement.productId,
        state: restoredState,
      }),
    ]);

  return Object.freeze({
    kind: 'VOID_PREPARED',
    purchase: voidedPurchase,
    reversals,
    inventoryStateUpdates,
  });
}
