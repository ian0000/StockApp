import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import {
  PurchaseNotFoundError,
  type HistoryEntry,
  type PurchaseDetails,
  type VoidPurchaseResult,
} from '@stock-app/application';
import {
  createInventoryMovement,
  createPurchase,
  Money,
  type PurchaseStatus,
} from '@stock-app/domain';

import {
  createPurchaseDetailsPresentation,
  createPurchaseDetailsRequest,
  createPurchaseDetailsRoute,
  createPurchaseVoidSubmissionGate,
  getHistoryPurchaseRoute,
  getPurchaseDetailsContentKind,
  getPurchaseVoidErrorPresentation,
  getPurchaseVoidResultPresentation,
  isPurchaseVoidActionVisible,
  normalizePurchaseIdParam,
  type PurchaseDetailsState,
} from '../src/ui/purchases/purchase-details-presentation';

function details(overrides: Partial<PurchaseDetails> = {}): PurchaseDetails {
  return {
    id: 'purchase-123',
    productId: 'product-1',
    productName: 'Coca-Cola',
    productVariant: '500 ml',
    quantity: 12,
    unitCost: Money.fromDecimal('0.85'),
    totalAmount: Money.fromDecimal('10.20'),
    effectiveAt: 1_777_000_000_000,
    createdAt: 1_777_000_000_001,
    status: 'CONFIRMED',
    notes: null,
    averageCostBefore: Money.fromDecimal('1.00'),
    averageCostAfter: Money.fromDecimal('0.918182'),
    stockBefore: 10,
    stockAfter: 22,
    ...overrides,
  };
}

function purchase(status: PurchaseStatus = 'CONFIRMED') {
  return createPurchase({
    id: 'purchase-123',
    inventoryId: 'inventory-123',
    productId: 'product-1',
    quantity: 12,
    unitCost: Money.fromDecimal('0.85'),
    totalAmount: Money.fromDecimal('10.20'),
    effectiveAt: 1_777_000_000_000,
    createdAt: 1_777_000_000_001,
    updatedAt: 1_777_000_000_001,
    status,
    notes: null,
    averageCostBefore: Money.fromDecimal('1.00'),
    averageCostAfter: Money.fromDecimal('0.918182'),
    stockBefore: 10,
    stockAfter: 22,
  });
}

function purchaseReversal() {
  return createInventoryMovement({
    id: 'reversal-123',
    inventoryId: 'inventory-123',
    productId: 'product-1',
    type: 'REVERSAL',
    quantityDelta: -12,
    unitCostSnapshot: Money.fromDecimal('1.00'),
    stockBefore: 22,
    stockAfter: 10,
    sourceType: 'INVENTORY_MOVEMENT',
    sourceId: 'purchase-movement-123',
    metadata: null,
    effectiveAt: 1_777_000_000_002,
    createdAt: 1_777_000_000_002,
    updatedAt: 1_777_000_000_002,
  });
}

test('navigation carries only the selected Purchase ID', () => {
  assert.deepEqual(createPurchaseDetailsRoute('purchase-123'), {
    pathname: '/purchase/[id]',
    params: { id: 'purchase-123' },
  });
  assert.deepEqual(
    createPurchaseDetailsRequest('inventory-123', 'purchase-123'),
    { inventoryId: 'inventory-123', purchaseId: 'purchase-123' },
  );
});

test('only Purchase History entries expose a Purchase detail route', () => {
  const purchase: HistoryEntry = {
    type: 'PURCHASE',
    id: 'purchase-123',
    productId: 'product-1',
    productName: 'Coca-Cola',
    productVariant: null,
    quantity: 1,
    unitCost: Money.fromDecimal('0.50'),
    totalAmount: Money.fromDecimal('0.50'),
    status: 'CONFIRMED',
    effectiveAt: 1,
    createdAt: 1,
  };
  const sale: HistoryEntry = {
    type: 'SALE',
    id: 'sale-123',
    totalAmount: Money.fromDecimal('1.00'),
    units: 1,
    status: 'CONFIRMED',
    effectiveAt: 1,
    createdAt: 1,
  };
  const adjustment: HistoryEntry = {
    type: 'ADJUSTMENT',
    id: 'adjustment-123',
    productId: 'product-1',
    productName: 'Coca-Cola',
    productVariant: null,
    difference: -1,
    reason: 'DAMAGED',
    effectiveAt: 1,
    createdAt: 1,
  };

  assert.deepEqual(
    getHistoryPurchaseRoute(purchase),
    createPurchaseDetailsRoute('purchase-123'),
  );
  assert.equal(getHistoryPurchaseRoute(sale), null);
  assert.equal(getHistoryPurchaseRoute(adjustment), null);
});

test('normalizes a valid dynamic Purchase ID and rejects ambiguous values', () => {
  assert.equal(normalizePurchaseIdParam(' purchase-123 '), 'purchase-123');
  assert.equal(normalizePurchaseIdParam(undefined), null);
  assert.equal(normalizePurchaseIdParam('   '), null);
  assert.equal(normalizePurchaseIdParam(['purchase-1', 'purchase-2']), null);
});

test('presents confirmed Purchase and every persisted operation snapshot', () => {
  const presentation = createPurchaseDetailsPresentation(details(), 'USD');

  assert.equal(presentation.statusLabel, 'Confirmada');
  assert.equal(presentation.productName, 'Coca-Cola');
  assert.equal(presentation.productVariant, '500 ml');
  assert.equal(presentation.quantityLabel, '12 unidades');
  assert.equal(presentation.unitCostLabel, 'USD 0.85');
  assert.equal(presentation.totalAmountLabel, 'USD 10.20');
  assert.equal(presentation.stockTransitionLabel, '10 → 22 unidades');
  assert.equal(presentation.averageCostBeforeLabel, 'USD 1.00');
  assert.equal(presentation.averageCostAfterLabel, 'USD 0.92');
});

test('preserves negative stock snapshots and unavailable previous cost', () => {
  const presentation = createPurchaseDetailsPresentation(
    details({
      stockBefore: -2,
      stockAfter: 8,
      averageCostBefore: null,
      averageCostAfter: Money.fromDecimal('0.85'),
    }),
    'USD',
  );

  assert.equal(presentation.stockTransitionLabel, '-2 → 8 unidades');
  assert.equal(presentation.averageCostBeforeLabel, 'No disponible');
  assert.equal(presentation.averageCostAfterLabel, 'USD 0.85');
});

test('preserves known zero and exact six-decimal historical costs', () => {
  const zero = createPurchaseDetailsPresentation(
    details({
      unitCost: Money.zero(),
      totalAmount: Money.zero(),
      averageCostAfter: Money.zero(),
    }),
    'USD',
  );
  const precise = createPurchaseDetailsPresentation(
    details({ unitCost: Money.fromDecimal('0.123456') }),
    'USD',
  );

  assert.equal(zero.unitCostLabel, 'USD 0.00');
  assert.equal(zero.totalAmountLabel, 'USD 0.00');
  assert.equal(zero.averageCostAfterLabel, 'USD 0.00');
  assert.equal(precise.unitCostLabel, 'USD 0.12');
});

test('presents unavailable Product safely and VOIDED without erasing values', () => {
  const presentation = createPurchaseDetailsPresentation(
    details({
      productName: null,
      productVariant: null,
      status: 'VOIDED',
    }),
    'USD',
  );

  assert.equal(presentation.productName, 'Producto no disponible');
  assert.equal(presentation.statusLabel, 'Anulada');
  assert.equal(presentation.isVoided, true);
  assert.equal(presentation.quantityLabel, '12 unidades');
  assert.equal(presentation.totalAmountLabel, 'USD 10.20');
});

test('shows the void action only for a persisted CONFIRMED Purchase', () => {
  assert.equal(isPurchaseVoidActionVisible('CONFIRMED', 'sqlite'), true);
  assert.equal(isPurchaseVoidActionVisible('VOIDED', 'sqlite'), false);
  assert.equal(isPurchaseVoidActionVisible('CONFIRMED', 'web-preview'), false);
});

test('presents successful and idempotent void results with a SQLite refresh', () => {
  const voided: VoidPurchaseResult = {
    kind: 'VOIDED',
    purchase: purchase('VOIDED'),
    reversals: [purchaseReversal()],
  };
  const alreadyVoided: VoidPurchaseResult = {
    kind: 'ALREADY_VOIDED',
    purchase: purchase('VOIDED'),
    reversals: [],
  };

  assert.deepEqual(getPurchaseVoidResultPresentation(voided), {
    kind: 'success',
    title: 'Compra anulada',
    message:
      'El stock y el costo fueron restaurados. La compra permanece en tu historial como anulada.',
    shouldRefresh: true,
    canRetry: false,
  });
  assert.deepEqual(getPurchaseVoidResultPresentation(alreadyVoided), {
    kind: 'information',
    title: 'Compra ya anulada',
    message: 'Esta compra ya estaba anulada.',
    shouldRefresh: true,
    canRetry: false,
  });
});

test('presents a non-eligible Purchase without technical terms or local mutation', () => {
  const result: VoidPurchaseResult = {
    kind: 'NOT_ELIGIBLE',
    purchase: purchase(),
    reason: 'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT',
  };

  assert.deepEqual(getPurchaseVoidResultPresentation(result), {
    kind: 'not-eligible',
    title: 'No se puede anular esta compra',
    message:
      'Hay operaciones posteriores de este producto y ya no es posible volver de forma segura al estado anterior.',
    shouldRefresh: false,
    canRetry: false,
  });
});

test('distinguishes a missing Purchase from a retryable technical failure', () => {
  assert.deepEqual(
    getPurchaseVoidErrorPresentation(new PurchaseNotFoundError()),
    {
      kind: 'not-found',
      shouldRefresh: true,
      canRetry: false,
    },
  );
  assert.deepEqual(
    getPurchaseVoidErrorPresentation(new Error('database failed')),
    {
      kind: 'technical-error',
      title: 'No pudimos anular la compra',
      message: 'Inténtalo nuevamente. Tus datos no fueron modificados.',
      shouldRefresh: false,
      canRetry: true,
    },
  );
});

test('submission gate allows one active call and a later retry', async () => {
  const gate = createPurchaseVoidSubmissionGate();
  let releaseFirstCall!: () => void;
  const firstCallPending = new Promise<void>((resolve) => {
    releaseFirstCall = resolve;
  });
  let executionCount = 0;

  async function submit(work: () => Promise<void>) {
    if (!gate.tryStart()) return;

    executionCount += 1;
    try {
      await work();
    } finally {
      gate.finish();
    }
  }

  const first = submit(() => firstCallPending);
  await submit(async () => undefined);

  assert.equal(executionCount, 1);

  releaseFirstCall();
  await first;
  await submit(async () => undefined);

  assert.equal(executionCount, 2);
});

test('Purchase detail wires only Application voiding and exposes no Undo control', () => {
  const screenSource = readFileSync(
    fileURLToPath(new URL('../src/app/purchase/[id].tsx', import.meta.url)),
    'utf8',
  );
  const runtimeSource = readFileSync(
    fileURLToPath(
      new URL('../src/ui/runtime/app-runtime.native.tsx', import.meta.url),
    ),
    'utf8',
  );

  assert.match(screenSource, /purchaseServices\.voidPurchase\.execute/);
  assert.equal(
    screenSource.match(/purchaseServices\.voidPurchase\.execute/g)?.length,
    1,
  );
  assert.doesNotMatch(screenSource, /registerPurchase\.execute/);
  assert.doesNotMatch(screenSource, /sqlite|drizzle/i);
  assert.match(screenSource, /¿Anular esta compra\?/);
  assert.match(screenSource, /stock y el costo/);
  assert.match(screenSource, /Anulando…/);
  assert.match(
    screenSource,
    /onPress=\{\(\) => setVoidConfirmationVisible\(false\)\}/,
  );
  assert.doesNotMatch(screenSource, /Deshacer|Undo/);
  assert.match(runtimeSource, /voidPurchase: state\.services\.voidPurchase/);
});

for (const [state, expected] of [
  [{ status: 'loading' }, 'loading'],
  [{ status: 'ready', details: details() }, 'loaded'],
  [{ status: 'ready', details: null }, 'not-found'],
  [{ status: 'error' }, 'error'],
] as const satisfies readonly (readonly [
  PurchaseDetailsState,
  'loading' | 'loaded' | 'not-found' | 'error',
])[]) {
  test(`Purchase detail resolves ${expected} content`, () => {
    assert.equal(getPurchaseDetailsContentKind(state), expected);
  });
}
