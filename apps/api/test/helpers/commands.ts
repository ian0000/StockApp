import type { RegisterPurchaseCommand } from '@stock-app/contracts';
import type { CommandChanges } from '../../src/infrastructure/postgres/change-sets.js';
import { id } from '../postgres/helpers.js';

export function purchaseCommand(operationId = id()): RegisterPurchaseCommand {
  return {
    protocolVersion: 1,
    domainVersion: 1,
    commandKind: 'PURCHASE_REGISTER',
    operationId,
    deviceId: null,
    occurredAt: 100,
    dependsOn: [],
    payload: {
      purchaseId: id(),
      movementId: id(),
      productId: '550e8400-e29b-41d4-a716-446655440000',
      createdAt: 100,
      quantity: 1,
      unitCost: '0',
      notes: null,
    },
    preconditions: {
      expectedStateRevision: '0',
      expectedState: { stock: 0, unitCost: null, lastMovementId: null },
    },
  };
}

export function emptyChanges(): CommandChanges {
  return {
    upserts: {
      products: [],
      inventoryStates: [],
      sales: [],
      saleItems: [],
      purchases: [],
      stockAdjustments: [],
      inventoryMovements: [],
    },
    tombstones: [],
  };
}

export function barrier() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}
