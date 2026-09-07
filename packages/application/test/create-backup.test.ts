import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CreateBackupUseCase,
  type BackupDataV1,
  type BackupSnapshotReader,
  type Clock,
} from '../src/index';

const INVENTORY_ID = 'inventory-1';
const CREATED_AT = 1_788_791_400_123;

function completeSnapshot(): BackupDataV1 {
  return {
    inventories: [
      {
        id: INVENTORY_ID,
        name: 'Mi Negocio',
        currency: 'USD',
        createdAt: 10,
        updatedAt: 11,
      },
    ],
    products: [
      {
        id: 'product-2',
        inventoryId: INVENTORY_ID,
        name: 'Archivado',
        variant: null,
        barcode: '0012345678905',
        regularSalePriceUnits: 0,
        minimumStock: null,
        isArchived: true,
        createdAt: 20,
        updatedAt: 21,
      },
      {
        id: 'product-1',
        inventoryId: INVENTORY_ID,
        name: 'Activo',
        variant: '500 ml',
        barcode: null,
        regularSalePriceUnits: 123_456_789,
        minimumStock: 2,
        isArchived: false,
        createdAt: 20,
        updatedAt: 22,
      },
    ],
    inventoryStates: [
      {
        inventoryId: INVENTORY_ID,
        productId: 'product-2',
        stock: -2,
        unitCostUnits: 0,
      },
      {
        inventoryId: INVENTORY_ID,
        productId: 'product-1',
        stock: 3,
        unitCostUnits: null,
      },
    ],
    inventoryMovements: [
      {
        id: 'movement-2',
        inventoryId: INVENTORY_ID,
        productId: 'product-2',
        type: 'REVERSAL',
        quantityDelta: 1,
        unitCostSnapshotUnits: 0,
        stockBefore: -3,
        stockAfter: -2,
        sourceType: 'INVENTORY_MOVEMENT',
        sourceId: 'movement-1',
        metadata: '{"futureCompatible":true}',
        effectiveAt: 41,
        createdAt: 42,
        updatedAt: 43,
      },
      {
        id: 'movement-1',
        inventoryId: INVENTORY_ID,
        productId: 'product-1',
        type: 'INITIAL_STOCK',
        quantityDelta: 3,
        unitCostSnapshotUnits: null,
        stockBefore: 0,
        stockAfter: 3,
        sourceType: null,
        sourceId: null,
        metadata: null,
        effectiveAt: 31,
        createdAt: 32,
        updatedAt: 33,
      },
    ],
    sales: [
      {
        id: 'sale-1',
        inventoryId: INVENTORY_ID,
        effectiveAt: 51,
        createdAt: 52,
        updatedAt: 53,
        status: 'VOIDED',
        totalAmountUnits: 1_250_000,
        estimatedCostUnits: null,
        estimatedProfitUnits: null,
        notes: null,
      },
    ],
    saleItems: [
      {
        id: 'sale-item-1',
        saleId: 'sale-1',
        productId: 'product-1',
        quantity: 1,
        unitSalePriceUnits: 1_250_000,
        subtotalUnits: 1_250_000,
        unitCostSnapshotUnits: null,
        estimatedCostUnits: null,
        estimatedProfitUnits: null,
        costStatus: 'UNKNOWN',
        createdAt: 52,
        updatedAt: 53,
      },
    ],
    purchases: [
      {
        id: 'purchase-1',
        inventoryId: INVENTORY_ID,
        productId: 'product-2',
        quantity: 2,
        unitCostUnits: 0,
        totalAmountUnits: 0,
        effectiveAt: 61,
        createdAt: 62,
        updatedAt: 63,
        status: 'VOIDED',
        notes: 'Prueba',
        averageCostBeforeUnits: null,
        averageCostAfterUnits: 0,
        stockBefore: -4,
        stockAfter: -2,
      },
    ],
    stockAdjustments: [
      {
        id: 'adjustment-1',
        inventoryId: INVENTORY_ID,
        productId: 'product-1',
        stockBefore: 2,
        actualStock: 3,
        difference: 1,
        reason: 'COUNT_CORRECTION',
        costMode: 'CUSTOM_COST',
        unitCostUnits: 700_000,
        effectiveAt: 71,
        createdAt: 72,
        updatedAt: 73,
      },
    ],
  };
}

function createSubject(snapshot = completeSnapshot()): {
  readonly subject: CreateBackupUseCase;
  readonly readerCalls: string[];
  readonly clockCalls: { value: number };
} {
  const readerCalls: string[] = [];
  const clockCalls = { value: 0 };
  const reader: BackupSnapshotReader = {
    async readSnapshot(inventoryId) {
      readerCalls.push(inventoryId);
      return snapshot;
    },
  };
  const clock: Clock = {
    now() {
      clockCalls.value += 1;
      return CREATED_AT;
    },
  };

  return {
    subject: new CreateBackupUseCase({ reader, clock }),
    readerCalls,
    clockCalls,
  };
}

test('creates a versioned complete JSON artifact with all eight collections', async () => {
  const { subject, readerCalls, clockCalls } = createSubject();

  const artifact = await subject.execute({ inventoryId: INVENTORY_ID });
  const document = JSON.parse(artifact.contents) as Record<string, unknown>;

  assert.equal(artifact.mimeType, 'application/json');
  assert.equal(artifact.fileName, 'stockapp-backup-2026-09-07-143000.json');
  assert.deepEqual(artifact.metadata, {
    format: 'stockapp-backup',
    formatVersion: 1,
    createdAt: CREATED_AT,
    inventoryId: INVENTORY_ID,
  });
  assert.deepEqual(Object.keys(document), [
    'format',
    'formatVersion',
    'createdAt',
    'inventoryId',
    'data',
  ]);
  assert.deepEqual(Object.keys(document.data as object), [
    'inventories',
    'products',
    'inventoryStates',
    'inventoryMovements',
    'sales',
    'saleItems',
    'purchases',
    'stockAdjustments',
  ]);
  assert.deepEqual(readerCalls, [INVENTORY_ID]);
  assert.equal(clockCalls.value, 1);
});

test('preserves scaled Money, null versus known zero, UUID-like IDs, timestamps, statuses, and movement metadata', async () => {
  const { subject } = createSubject();
  const artifact = await subject.execute({ inventoryId: INVENTORY_ID });
  const document = JSON.parse(artifact.contents) as {
    data: BackupDataV1;
  };

  assert.equal(document.data.products[1]?.barcode, '0012345678905');
  assert.equal(document.data.products[1]?.regularSalePriceUnits, 0);
  assert.equal(document.data.products[0]?.regularSalePriceUnits, 123_456_789);
  assert.equal(document.data.inventoryStates[0]?.unitCostUnits, null);
  assert.equal(document.data.inventoryStates[1]?.unitCostUnits, 0);
  assert.equal(document.data.inventoryStates[1]?.stock, -2);
  assert.equal(document.data.inventoryMovements[1]?.type, 'REVERSAL');
  assert.equal(
    document.data.inventoryMovements[1]?.metadata,
    '{"futureCompatible":true}',
  );
  assert.equal(document.data.sales[0]?.status, 'VOIDED');
  assert.equal(document.data.purchases[0]?.status, 'VOIDED');
  assert.equal(document.data.stockAdjustments[0]?.createdAt, 72);
});

test('sorts every collection deterministically without mutating the reader snapshot', async () => {
  const snapshot = completeSnapshot();
  const originalProductOrder = snapshot.products.map(({ id }) => id);
  const { subject } = createSubject(snapshot);

  const first = await subject.execute({ inventoryId: INVENTORY_ID });
  const second = await subject.execute({ inventoryId: INVENTORY_ID });
  const document = JSON.parse(first.contents) as { data: BackupDataV1 };

  assert.equal(first.contents, second.contents);
  assert.deepEqual(
    document.data.products.map(({ id }) => id),
    ['product-1', 'product-2'],
  );
  assert.deepEqual(
    document.data.inventoryMovements.map(({ id }) => id),
    ['movement-1', 'movement-2'],
  );
  assert.deepEqual(
    snapshot.products.map(({ id }) => id),
    originalProductOrder,
  );
});

test('supports an otherwise empty inventory snapshot', async () => {
  const snapshot = completeSnapshot();
  const { subject } = createSubject({
    ...snapshot,
    products: [],
    inventoryStates: [],
    inventoryMovements: [],
    sales: [],
    saleItems: [],
    purchases: [],
    stockAdjustments: [],
  });

  const artifact = await subject.execute({ inventoryId: INVENTORY_ID });
  const document = JSON.parse(artifact.contents) as { data: BackupDataV1 };

  assert.deepEqual(document.data.products, []);
});

test('rejects data from another inventory instead of exporting a partial or mixed snapshot', async () => {
  const snapshot = completeSnapshot();
  const { subject } = createSubject({
    ...snapshot,
    products: [
      {
        ...snapshot.products[0]!,
        inventoryId: 'another-inventory',
      },
    ],
    inventoryStates: [],
    inventoryMovements: [],
    sales: [],
    saleItems: [],
    purchases: [],
    stockAdjustments: [],
  });

  await assert.rejects(
    subject.execute({ inventoryId: INVENTORY_ID }),
    /another inventory/i,
  );
});

test('rejects orphan sale items and missing inventory states', async () => {
  const snapshot = completeSnapshot();
  const { subject: orphanSubject } = createSubject({
    ...snapshot,
    saleItems: [{ ...snapshot.saleItems[0]!, saleId: 'missing-sale' }],
  });
  const { subject: missingStateSubject } = createSubject({
    ...snapshot,
    inventoryStates: snapshot.inventoryStates.slice(1),
  });

  await assert.rejects(orphanSubject.execute({ inventoryId: INVENTORY_ID }));
  await assert.rejects(
    missingStateSubject.execute({ inventoryId: INVENTORY_ID }),
  );
});

test('rejects unsafe integer persistence values instead of losing JSON precision', async () => {
  const snapshot = completeSnapshot();
  const { subject } = createSubject({
    ...snapshot,
    products: [
      {
        ...snapshot.products[0]!,
        regularSalePriceUnits: Number.MAX_SAFE_INTEGER + 1,
      },
      snapshot.products[1]!,
    ],
  });

  await assert.rejects(
    subject.execute({ inventoryId: INVENTORY_ID }),
    /safe integer/i,
  );
});

test('rejects invalid persisted IDs and negative timestamps', async () => {
  const snapshot = completeSnapshot();
  const { subject: invalidIdSubject } = createSubject({
    ...snapshot,
    inventoryMovements: [
      { ...snapshot.inventoryMovements[0]!, id: '   ' },
      snapshot.inventoryMovements[1]!,
    ],
  });
  const { subject: invalidTimestampSubject } = createSubject({
    ...snapshot,
    sales: [{ ...snapshot.sales[0]!, effectiveAt: -1 }],
  });

  await assert.rejects(
    invalidIdSubject.execute({ inventoryId: INVENTORY_ID }),
    /non-empty text ID/i,
  );
  await assert.rejects(
    invalidTimestampSubject.execute({ inventoryId: INVENTORY_ID }),
    /non-negative timestamp/i,
  );
});

test('propagates snapshot reader failures without producing an artifact', async () => {
  const failure = new Error('sqlite failed');
  const reader: BackupSnapshotReader = {
    async readSnapshot() {
      throw failure;
    },
  };
  const subject = new CreateBackupUseCase({
    reader,
    clock: { now: () => CREATED_AT },
  });

  await assert.rejects(subject.execute({ inventoryId: INVENTORY_ID }), failure);
});
