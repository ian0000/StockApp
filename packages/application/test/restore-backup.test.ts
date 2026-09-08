import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BackupValidationError,
  CreateBackupUseCase,
  RestoreBackupUseCase,
  createBackupRestorePreview,
  parseBackupV1,
  type BackupRestoreTransaction,
  type StockAppBackupV1,
} from '../src/index';

const INVENTORY_ID = 'inventory-restore';

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function validDocument(): Mutable<StockAppBackupV1> {
  return {
    format: 'stockapp-backup',
    formatVersion: 1,
    createdAt: 1_788_800_000_000,
    inventoryId: INVENTORY_ID,
    data: {
      inventories: [
        {
          id: INVENTORY_ID,
          name: 'Mi negocio',
          currency: 'USD',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      products: [
        {
          id: 'product-active',
          inventoryId: INVENTORY_ID,
          name: 'Activo',
          variant: '500 ml',
          barcode: '0012345',
          regularSalePriceUnits: 1_000_000,
          minimumStock: 2,
          isArchived: false,
          createdAt: 10,
          updatedAt: 11,
        },
        {
          id: 'product-archived',
          inventoryId: INVENTORY_ID,
          name: 'Archivado',
          variant: null,
          barcode: '0012345',
          regularSalePriceUnits: 0,
          minimumStock: null,
          isArchived: true,
          createdAt: 12,
          updatedAt: 13,
        },
      ],
      inventoryStates: [
        {
          inventoryId: INVENTORY_ID,
          productId: 'product-active',
          stock: 12,
          unitCostUnits: 800_000,
        },
        {
          inventoryId: INVENTORY_ID,
          productId: 'product-archived',
          stock: -1,
          unitCostUnits: null,
        },
      ],
      inventoryMovements: [
        {
          id: 'movement-initial',
          inventoryId: INVENTORY_ID,
          productId: 'product-active',
          type: 'INITIAL_STOCK',
          quantityDelta: 10,
          unitCostSnapshotUnits: 700_000,
          stockBefore: 0,
          stockAfter: 10,
          sourceType: null,
          sourceId: null,
          metadata: null,
          effectiveAt: 20,
          createdAt: 20,
          updatedAt: 20,
        },
        {
          id: 'movement-purchase',
          inventoryId: INVENTORY_ID,
          productId: 'product-active',
          type: 'PURCHASE',
          quantityDelta: 2,
          unitCostSnapshotUnits: 800_000,
          stockBefore: 10,
          stockAfter: 12,
          sourceType: 'PURCHASE',
          sourceId: 'purchase-1',
          metadata: null,
          effectiveAt: 30,
          createdAt: 30,
          updatedAt: 30,
        },
        {
          id: 'movement-sale',
          inventoryId: INVENTORY_ID,
          productId: 'product-active',
          type: 'SALE',
          quantityDelta: -2,
          unitCostSnapshotUnits: 700_000,
          stockBefore: 12,
          stockAfter: 10,
          sourceType: 'SALE',
          sourceId: 'sale-1',
          metadata: '{"preserved":true}',
          effectiveAt: 40,
          createdAt: 40,
          updatedAt: 40,
        },
        {
          id: 'movement-adjustment-out',
          inventoryId: INVENTORY_ID,
          productId: 'product-active',
          type: 'ADJUSTMENT_OUT',
          quantityDelta: -1,
          unitCostSnapshotUnits: 716_667,
          stockBefore: 10,
          stockAfter: 9,
          sourceType: 'STOCK_ADJUSTMENT',
          sourceId: 'adjustment-out',
          metadata: null,
          effectiveAt: 50,
          createdAt: 50,
          updatedAt: 50,
        },
        {
          id: 'movement-adjustment-in',
          inventoryId: INVENTORY_ID,
          productId: 'product-active',
          type: 'ADJUSTMENT_IN',
          quantityDelta: 1,
          unitCostSnapshotUnits: 900_000,
          stockBefore: 9,
          stockAfter: 10,
          sourceType: 'STOCK_ADJUSTMENT',
          sourceId: 'adjustment-in',
          metadata: null,
          effectiveAt: 60,
          createdAt: 60,
          updatedAt: 60,
        },
        {
          id: 'movement-reversal',
          inventoryId: INVENTORY_ID,
          productId: 'product-active',
          type: 'REVERSAL',
          quantityDelta: 2,
          unitCostSnapshotUnits: 700_000,
          stockBefore: 10,
          stockAfter: 12,
          sourceType: 'INVENTORY_MOVEMENT',
          sourceId: 'movement-sale',
          metadata: null,
          effectiveAt: 70,
          createdAt: 70,
          updatedAt: 70,
        },
      ],
      sales: [
        {
          id: 'sale-1',
          inventoryId: INVENTORY_ID,
          effectiveAt: 40,
          createdAt: 40,
          updatedAt: 70,
          status: 'VOIDED',
          totalAmountUnits: 2_000_000,
          estimatedCostUnits: 1_400_000,
          estimatedProfitUnits: 600_000,
          notes: null,
        },
      ],
      saleItems: [
        {
          id: 'sale-item-1',
          saleId: 'sale-1',
          productId: 'product-active',
          quantity: 2,
          unitSalePriceUnits: 1_000_000,
          subtotalUnits: 2_000_000,
          unitCostSnapshotUnits: 700_000,
          estimatedCostUnits: 1_400_000,
          estimatedProfitUnits: 600_000,
          costStatus: 'KNOWN',
          createdAt: 40,
          updatedAt: 40,
        },
      ],
      purchases: [
        {
          id: 'purchase-1',
          inventoryId: INVENTORY_ID,
          productId: 'product-active',
          quantity: 2,
          unitCostUnits: 800_000,
          totalAmountUnits: 1_600_000,
          effectiveAt: 30,
          createdAt: 30,
          updatedAt: 30,
          status: 'CONFIRMED',
          notes: null,
          averageCostBeforeUnits: 700_000,
          averageCostAfterUnits: 716_667,
          stockBefore: 10,
          stockAfter: 12,
        },
      ],
      stockAdjustments: [
        {
          id: 'adjustment-out',
          inventoryId: INVENTORY_ID,
          productId: 'product-active',
          stockBefore: 10,
          actualStock: 9,
          difference: -1,
          reason: 'DAMAGED',
          costMode: null,
          unitCostUnits: 716_667,
          effectiveAt: 50,
          createdAt: 50,
          updatedAt: 50,
        },
        {
          id: 'adjustment-in',
          inventoryId: INVENTORY_ID,
          productId: 'product-active',
          stockBefore: 9,
          actualStock: 10,
          difference: 1,
          reason: 'COUNT_CORRECTION',
          costMode: 'CUSTOM_COST',
          unitCostUnits: 900_000,
          effectiveAt: 60,
          createdAt: 60,
          updatedAt: 60,
        },
      ],
    },
  };
}

function text(document: unknown): string {
  return JSON.stringify(document);
}

function changed(
  mutate: (document: ReturnType<typeof validDocument>) => void,
): string {
  const document = structuredClone(validDocument());
  mutate(document);
  return text(document);
}

function expectInvalid(contents: string, pattern?: RegExp): void {
  assert.throws(
    () => parseBackupV1(contents),
    (error: unknown) => {
      assert.ok(error instanceof BackupValidationError);
      assert.equal(error.code, 'INVALID_DOCUMENT');
      if (pattern !== undefined) assert.match(error.message, pattern);
      return true;
    },
  );
}

test('parses a complete Backup V1 without changing exact persisted values', () => {
  const document = validDocument();
  const parsed = parseBackupV1(text(document));

  assert.deepEqual(parsed, document);
  assert.equal(parsed.data.products[0]?.barcode, '0012345');
  assert.equal(parsed.data.inventoryStates[1]?.unitCostUnits, null);
  assert.equal(parsed.data.products[1]?.regularSalePriceUnits, 0);
  assert.equal(
    parsed.data.inventoryMovements[2]?.metadata,
    '{"preserved":true}',
  );
  assert.deepEqual(
    parsed.data.inventoryMovements.map(({ type }) => type),
    [
      'INITIAL_STOCK',
      'PURCHASE',
      'SALE',
      'ADJUSTMENT_OUT',
      'ADJUSTMENT_IN',
      'REVERSAL',
    ],
  );
});

test('accepts the exact artifact produced by CreateBackupUseCase', async () => {
  const source = validDocument();
  const artifact = await new CreateBackupUseCase({
    reader: { readSnapshot: async () => source.data },
    clock: { now: () => source.createdAt },
  }).execute({ inventoryId: source.inventoryId });

  assert.deepEqual(parseBackupV1(artifact.contents), source);
});

test('distinguishes invalid JSON, another format and an unsupported version', () => {
  assert.throws(
    () => parseBackupV1('{'),
    (error: unknown) =>
      error instanceof BackupValidationError && error.code === 'INVALID_JSON',
  );
  assert.throws(
    () => parseBackupV1(text({ ...validDocument(), format: 'other' })),
    (error: unknown) =>
      error instanceof BackupValidationError && error.code === 'WRONG_FORMAT',
  );
  assert.throws(
    () => parseBackupV1(text({ ...validDocument(), formatVersion: 2 })),
    (error: unknown) =>
      error instanceof BackupValidationError &&
      error.code === 'UNSUPPORTED_VERSION',
  );
});

test('requires the data object and all eight collections', () => {
  expectInvalid(text({ ...validDocument(), data: undefined }));
  expectInvalid(
    changed((document) => {
      delete (document.data as Partial<typeof document.data>).purchases;
    }),
  );
});

test('rejects wrong primitive types, empty IDs, invalid timestamps and unsafe integers', () => {
  expectInvalid(
    changed((document) => {
      (document.data.products[0] as { isArchived: unknown }).isArchived = 0;
    }),
  );
  expectInvalid(
    changed((document) => {
      (document.data.products[0] as { id: string }).id = '   ';
    }),
  );
  expectInvalid(
    changed((document) => {
      (document.data.sales[0] as { effectiveAt: number }).effectiveAt = -1;
    }),
  );
  expectInvalid(
    changed((document) => {
      (
        document.data.products[0] as { regularSalePriceUnits: number }
      ).regularSalePriceUnits = Number.MAX_SAFE_INTEGER + 1;
    }),
  );
});

test('rejects duplicate IDs in every entity collection and duplicate InventoryState products', () => {
  expectInvalid(
    changed((document) => {
      document.data.products.push({ ...document.data.products[0]! });
    }),
    /duplicate/i,
  );
  expectInvalid(
    changed((document) => {
      document.data.inventoryStates.push({
        ...document.data.inventoryStates[0]!,
      });
    }),
    /duplicate/i,
  );
});

test('requires exactly one matching V1 Inventory and rejects foreign inventory rows', () => {
  expectInvalid(
    changed((document) => {
      document.inventoryId = 'different';
    }),
  );
  expectInvalid(
    changed((document) => {
      (document.data.products[0] as { inventoryId: string }).inventoryId =
        'different';
    }),
  );
});

test('applies active barcode uniqueness while allowing archived duplicates', () => {
  assert.doesNotThrow(() => parseBackupV1(text(validDocument())));
  expectInvalid(
    changed((document) => {
      (document.data.products[1] as { isArchived: boolean }).isArchived = false;
    }),
    /barcode/i,
  );
});

test('requires one valid InventoryState per Product and preserves negative stock, null and zero cost', () => {
  const parsed = parseBackupV1(text(validDocument()));
  assert.equal(parsed.data.inventoryStates[1]?.stock, -1);
  assert.equal(parsed.data.inventoryStates[1]?.unitCostUnits, null);

  const withZero = structuredClone(validDocument());
  withZero.data.inventoryStates[1] = {
    ...withZero.data.inventoryStates[1]!,
    unitCostUnits: 0,
  };
  assert.equal(
    parseBackupV1(text(withZero)).data.inventoryStates[1]?.unitCostUnits,
    0,
  );

  expectInvalid(
    changed((document) => {
      document.data.inventoryStates.pop();
    }),
  );
  expectInvalid(
    changed((document) => {
      (
        document.data.inventoryStates[0] as { unitCostUnits: number | null }
      ).unitCostUnits = -1;
    }),
  );
});

test('validates movement arithmetic, source conventions, references and reversal uniqueness', () => {
  expectInvalid(
    changed((document) => {
      (
        document.data.inventoryMovements[0] as { stockAfter: number }
      ).stockAfter = 9;
    }),
  );
  expectInvalid(
    changed((document) => {
      (
        document.data.inventoryMovements[1] as { sourceType: string | null }
      ).sourceType = 'SALE';
    }),
  );
  expectInvalid(
    changed((document) => {
      (
        document.data.inventoryMovements[5] as { sourceId: string | null }
      ).sourceId = 'missing';
    }),
  );
  expectInvalid(
    changed((document) => {
      (
        document.data.inventoryMovements[5] as { sourceId: string | null }
      ).sourceId = 'movement-adjustment-out';
      (
        document.data.inventoryMovements[5] as { quantityDelta: number }
      ).quantityDelta = 1;
      (
        document.data.inventoryMovements[5] as { stockAfter: number }
      ).stockAfter = 11;
      (
        document.data.inventoryMovements[5] as {
          unitCostSnapshotUnits: number | null;
        }
      ).unitCostSnapshotUnits = 716_667;
      (document.data.sales[0] as { status: string }).status = 'CONFIRMED';
      (document.data.sales[0] as { updatedAt: number }).updatedAt = 40;
    }),
    /reversal/i,
  );
  expectInvalid(
    changed((document) => {
      document.data.inventoryMovements.push({
        ...document.data.inventoryMovements[5]!,
        id: 'movement-reversal-2',
      });
    }),
    /reversal/i,
  );
});

test('validates Sale/SaleItem relationships, snapshots, completeness and enums', () => {
  expectInvalid(
    changed((document) => {
      document.data.saleItems.length = 0;
    }),
  );
  expectInvalid(
    changed((document) => {
      (document.data.saleItems[0] as { productId: string }).productId =
        'missing';
    }),
  );
  expectInvalid(
    changed((document) => {
      (document.data.saleItems[0] as { subtotalUnits: number }).subtotalUnits =
        1;
    }),
  );
  expectInvalid(
    changed((document) => {
      (document.data.sales[0] as { status: string }).status = 'PENDING';
    }),
  );
});

test('accepts confirmed and unknown-cost Sales while preserving known zero distinctly', () => {
  const confirmed = structuredClone(validDocument());
  confirmed.data.sales[0] = {
    ...confirmed.data.sales[0]!,
    status: 'CONFIRMED',
    updatedAt: 40,
  };
  confirmed.data.inventoryMovements.pop();
  assert.equal(
    parseBackupV1(text(confirmed)).data.sales[0]?.status,
    'CONFIRMED',
  );

  const unknown = structuredClone(confirmed);
  unknown.data.sales[0] = {
    ...unknown.data.sales[0]!,
    estimatedCostUnits: null,
    estimatedProfitUnits: null,
  };
  unknown.data.saleItems[0] = {
    ...unknown.data.saleItems[0]!,
    unitCostSnapshotUnits: null,
    estimatedCostUnits: null,
    estimatedProfitUnits: null,
    costStatus: 'UNKNOWN',
  };
  unknown.data.inventoryMovements[2] = {
    ...unknown.data.inventoryMovements[2]!,
    unitCostSnapshotUnits: null,
  };
  assert.equal(
    parseBackupV1(text(unknown)).data.saleItems[0]?.unitCostSnapshotUnits,
    null,
  );

  const knownZero = structuredClone(confirmed);
  knownZero.data.sales[0] = {
    ...knownZero.data.sales[0]!,
    estimatedCostUnits: 0,
    estimatedProfitUnits: 2_000_000,
  };
  knownZero.data.saleItems[0] = {
    ...knownZero.data.saleItems[0]!,
    unitCostSnapshotUnits: 0,
    estimatedCostUnits: 0,
    estimatedProfitUnits: 2_000_000,
  };
  knownZero.data.inventoryMovements[2] = {
    ...knownZero.data.inventoryMovements[2]!,
    unitCostSnapshotUnits: 0,
  };
  assert.equal(
    parseBackupV1(text(knownZero)).data.saleItems[0]?.unitCostSnapshotUnits,
    0,
  );
});

test('accepts a multi-product Sale with mixed known and unknown cost snapshots', () => {
  const document = structuredClone(validDocument());
  document.data.sales[0] = {
    ...document.data.sales[0]!,
    status: 'CONFIRMED',
    totalAmountUnits: 2_500_000,
    estimatedCostUnits: null,
    estimatedProfitUnits: null,
    updatedAt: 40,
  };
  document.data.saleItems.push({
    id: 'sale-item-2',
    saleId: 'sale-1',
    productId: 'product-archived',
    quantity: 1,
    unitSalePriceUnits: 500_000,
    subtotalUnits: 500_000,
    unitCostSnapshotUnits: null,
    estimatedCostUnits: null,
    estimatedProfitUnits: null,
    costStatus: 'UNKNOWN',
    createdAt: 40,
    updatedAt: 40,
  });
  document.data.inventoryMovements.pop();
  document.data.inventoryMovements.push({
    id: 'movement-sale-2',
    inventoryId: INVENTORY_ID,
    productId: 'product-archived',
    type: 'SALE',
    quantityDelta: -1,
    unitCostSnapshotUnits: null,
    stockBefore: 0,
    stockAfter: -1,
    sourceType: 'SALE',
    sourceId: 'sale-1',
    metadata: null,
    effectiveAt: 40,
    createdAt: 40,
    updatedAt: 40,
  });

  const parsed = parseBackupV1(text(document));

  assert.equal(parsed.data.saleItems.length, 2);
  assert.equal(parsed.data.sales[0]?.estimatedProfitUnits, null);
});

test('validates Purchase and StockAdjustment invariants and relations', () => {
  expectInvalid(
    changed((document) => {
      (document.data.purchases[0] as { stockAfter: number }).stockAfter = 13;
    }),
  );
  expectInvalid(
    changed((document) => {
      (document.data.purchases[0] as { productId: string }).productId =
        'missing';
    }),
  );
  expectInvalid(
    changed((document) => {
      (document.data.stockAdjustments[0] as { difference: number }).difference =
        -2;
    }),
  );
  expectInvalid(
    changed((document) => {
      (document.data.stockAdjustments[0] as { reason: string }).reason =
        'UNKNOWN';
    }),
  );
});

test('accepts Purchase snapshots from negative stock and a VOIDED Purchase with exact reversal', () => {
  const negative = structuredClone(validDocument());
  negative.data.purchases[0] = {
    ...negative.data.purchases[0]!,
    averageCostBeforeUnits: null,
    averageCostAfterUnits: 800_000,
    stockBefore: -3,
    stockAfter: -1,
  };
  negative.data.inventoryMovements[1] = {
    ...negative.data.inventoryMovements[1]!,
    stockBefore: -3,
    stockAfter: -1,
  };
  assert.equal(
    parseBackupV1(text(negative)).data.purchases[0]?.stockBefore,
    -3,
  );

  const knownZero = structuredClone(validDocument());
  knownZero.data.purchases[0] = {
    ...knownZero.data.purchases[0]!,
    unitCostUnits: 0,
    totalAmountUnits: 0,
    averageCostBeforeUnits: 0,
    averageCostAfterUnits: 0,
  };
  knownZero.data.inventoryMovements[1] = {
    ...knownZero.data.inventoryMovements[1]!,
    unitCostSnapshotUnits: 0,
  };
  assert.equal(
    parseBackupV1(text(knownZero)).data.purchases[0]?.averageCostBeforeUnits,
    0,
  );

  const voided = structuredClone(validDocument());
  voided.data.purchases[0] = {
    ...voided.data.purchases[0]!,
    status: 'VOIDED',
    updatedAt: 80,
  };
  voided.data.inventoryMovements.push({
    id: 'movement-purchase-reversal',
    inventoryId: INVENTORY_ID,
    productId: 'product-active',
    type: 'REVERSAL',
    quantityDelta: -2,
    unitCostSnapshotUnits: 800_000,
    stockBefore: 12,
    stockAfter: 10,
    sourceType: 'INVENTORY_MOVEMENT',
    sourceId: 'movement-purchase',
    metadata: null,
    effectiveAt: 80,
    createdAt: 80,
    updatedAt: 80,
  });
  assert.equal(parseBackupV1(text(voided)).data.purchases[0]?.status, 'VOIDED');
});

test('creates preview counts without writes', () => {
  const parsed = parseBackupV1(text(validDocument()));

  assert.deepEqual(createBackupRestorePreview(parsed), {
    createdAt: 1_788_800_000_000,
    inventoryId: INVENTORY_ID,
    inventoryName: 'Mi negocio',
    products: 2,
    archivedProducts: 1,
    sales: 1,
    voidedSales: 1,
    purchases: 1,
    voidedPurchases: 0,
    stockAdjustments: 2,
  });
});

test('restores only an already parsed Backup V1 through one replacement transaction', async () => {
  const calls: StockAppBackupV1['data'][] = [];
  const transaction: BackupRestoreTransaction = {
    async replace(data) {
      calls.push(data);
    },
  };
  const subject = new RestoreBackupUseCase(transaction);
  const parsed = parseBackupV1(text(validDocument()));

  const result = await subject.execute({ backup: parsed });

  assert.deepEqual(calls, [parsed.data]);
  assert.deepEqual(result, { inventoryId: INVENTORY_ID });
});

test('propagates replacement failure without reporting success', async () => {
  const failure = new Error('transaction rolled back');
  const transaction: BackupRestoreTransaction = {
    async replace() {
      throw failure;
    },
  };
  const subject = new RestoreBackupUseCase(transaction);

  await assert.rejects(
    subject.execute({ backup: parseBackupV1(text(validDocument())) }),
    failure,
  );
});
