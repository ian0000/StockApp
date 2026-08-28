import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPurchase,
  createPurchase,
  Money,
  type Purchase,
  type PurchaseStatus,
} from '@stock-app/domain';

import {
  GetPurchaseDetailsUseCase,
  type PurchaseDetailsReader,
  type PurchaseDetailsSource,
} from '../src/index';

const INVENTORY_ID = 'inventory-123';
const PURCHASE_ID = 'purchase-123';

interface PurchaseOptions {
  readonly status?: PurchaseStatus;
  readonly quantity?: number;
  readonly unitCost?: Money;
  readonly stockBefore?: number;
  readonly averageCostBefore?: Money | null;
  readonly notes?: string | null;
}

function purchase({
  status = 'CONFIRMED',
  quantity = 12,
  unitCost = Money.fromDecimal('0.85'),
  stockBefore = 0,
  averageCostBefore = null,
  notes = 'Entrega de la mañana',
}: PurchaseOptions = {}): Purchase {
  const after = applyPurchase({
    inventory: { stock: stockBefore, unitCost: averageCostBefore },
    quantity,
    unitCost,
  });

  if (after.unitCost === null) assert.fail('Purchase cost must be known.');

  return createPurchase({
    id: PURCHASE_ID,
    inventoryId: INVENTORY_ID,
    productId: 'product-1',
    quantity,
    unitCost,
    totalAmount: unitCost.multiplyByInteger(quantity),
    effectiveAt: 1_777_000_000_000,
    createdAt: 1_777_000_000_001,
    updatedAt: 1_777_000_000_001,
    status,
    notes,
    averageCostBefore,
    averageCostAfter: after.unitCost,
    stockBefore,
    stockAfter: after.stock,
  });
}

class StubPurchaseDetailsReader implements PurchaseDetailsReader {
  readonly calls: { inventoryId: string; purchaseId: string }[] = [];

  constructor(
    private readonly source: PurchaseDetailsSource | null,
    private readonly error: Error | null = null,
  ) {}

  async findById(input: {
    inventoryId: string;
    purchaseId: string;
  }): Promise<PurchaseDetailsSource | null> {
    this.calls.push(input);
    if (this.error !== null) throw this.error;
    return this.source;
  }
}

function createUseCase(source: PurchaseDetailsSource | null) {
  const reader = new StubPurchaseDetailsReader(source);
  return { reader, useCase: new GetPurchaseDetailsUseCase(reader) };
}

test('returns an existing confirmed Purchase with every persisted snapshot', async () => {
  const currentPurchase = purchase({
    stockBefore: 10,
    averageCostBefore: Money.fromDecimal('1.00'),
  });
  const { reader, useCase } = createUseCase({
    purchase: currentPurchase,
    productName: 'Coca-Cola',
    productVariant: '500 ml',
  });

  const details = await useCase.execute({
    inventoryId: ` ${INVENTORY_ID} `,
    purchaseId: ` ${PURCHASE_ID} `,
  });

  assert.deepEqual(reader.calls, [
    { inventoryId: INVENTORY_ID, purchaseId: PURCHASE_ID },
  ]);
  assert.equal(details?.id, PURCHASE_ID);
  assert.equal(details?.productId, 'product-1');
  assert.equal(details?.productName, 'Coca-Cola');
  assert.equal(details?.productVariant, '500 ml');
  assert.equal(details?.quantity, 12);
  assert.equal(details?.unitCost.scaledUnits, 850_000);
  assert.equal(details?.totalAmount.scaledUnits, 10_200_000);
  assert.equal(details?.status, 'CONFIRMED');
  assert.equal(details?.averageCostBefore?.scaledUnits, 1_000_000);
  assert.equal(details?.averageCostAfter.scaledUnits, 918_182);
  assert.equal(details?.stockBefore, 10);
  assert.equal(details?.stockAfter, 22);
  assert.equal(details?.notes, 'Entrega de la mañana');
});

test('returns null when Purchase is absent or belongs to another Inventory', async () => {
  const { useCase } = createUseCase(null);

  assert.equal(
    await useCase.execute({
      inventoryId: INVENTORY_ID,
      purchaseId: 'purchase-from-another-inventory',
    }),
    null,
  );
});

test('preserves VOIDED status without erasing operation values', async () => {
  const { useCase } = createUseCase({
    purchase: purchase({ status: 'VOIDED' }),
    productName: 'Coca-Cola',
    productVariant: null,
  });

  const details = await useCase.execute({
    inventoryId: INVENTORY_ID,
    purchaseId: PURCHASE_ID,
  });

  assert.equal(details?.status, 'VOIDED');
  assert.equal(details?.quantity, 12);
  assert.equal(details?.unitCost.scaledUnits, 850_000);
  assert.equal(details?.totalAmount.scaledUnits, 10_200_000);
});

test('preserves exact six-decimal Money values', async () => {
  const { useCase } = createUseCase({
    purchase: purchase({
      quantity: 3,
      unitCost: Money.fromDecimal('0.123456'),
    }),
    productName: 'Precisión',
    productVariant: null,
  });

  const details = await useCase.execute({
    inventoryId: INVENTORY_ID,
    purchaseId: PURCHASE_ID,
  });

  assert.equal(details?.unitCost.scaledUnits, 123_456);
  assert.equal(details?.totalAmount.scaledUnits, 370_368);
});

test('preserves a known zero purchase cost and total', async () => {
  const { useCase } = createUseCase({
    purchase: purchase({ quantity: 4, unitCost: Money.zero() }),
    productName: 'Muestra',
    productVariant: null,
  });

  const details = await useCase.execute({
    inventoryId: INVENTORY_ID,
    purchaseId: PURCHASE_ID,
  });

  assert.equal(details?.unitCost.scaledUnits, 0);
  assert.equal(details?.totalAmount.scaledUnits, 0);
  assert.equal(details?.averageCostAfter.scaledUnits, 0);
});

test('keeps archived or currently unavailable Product labels from hiding Purchase', async () => {
  const archived = createUseCase({
    purchase: purchase(),
    productName: 'Producto archivado',
    productVariant: 'Anterior',
  });
  const unavailable = createUseCase({
    purchase: purchase(),
    productName: null,
    productVariant: null,
  });

  const archivedDetails = await archived.useCase.execute({
    inventoryId: INVENTORY_ID,
    purchaseId: PURCHASE_ID,
  });
  const unavailableDetails = await unavailable.useCase.execute({
    inventoryId: INVENTORY_ID,
    purchaseId: PURCHASE_ID,
  });

  assert.equal(archivedDetails?.productName, 'Producto archivado');
  assert.equal(unavailableDetails?.productName, null);
  assert.equal(unavailableDetails?.unitCost.scaledUnits, 850_000);
});

test('rejects an out-of-scope Purchase returned by a defective reader', async () => {
  const outOfScope = {
    ...purchase(),
    inventoryId: 'inventory-2',
  };
  const { useCase } = createUseCase({
    purchase: outOfScope,
    productName: 'Coca-Cola',
    productVariant: null,
  });

  await assert.rejects(
    useCase.execute({
      inventoryId: INVENTORY_ID,
      purchaseId: PURCHASE_ID,
    }),
    /out-of-scope Purchase/,
  );
});

test('propagates reader failures unchanged', async () => {
  const failure = new Error('read failed');
  const reader = new StubPurchaseDetailsReader(null, failure);
  const useCase = new GetPurchaseDetailsUseCase(reader);

  await assert.rejects(
    useCase.execute({
      inventoryId: INVENTORY_ID,
      purchaseId: PURCHASE_ID,
    }),
    (error: unknown) => error === failure,
  );
});
