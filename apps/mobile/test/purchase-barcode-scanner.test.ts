import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import {
  RegisterPurchaseUseCase,
  type ProductSummary,
  type TransactionRepositories,
  type UpdateInventoryStateInput,
} from '@stock-app/application';
import {
  createInventoryState,
  createProduct,
  Money,
  type InventoryMovement,
  type Purchase,
} from '@stock-app/domain';

import {
  applyPurchaseProductSelection,
  createPurchaseScanResultGate,
  getPurchaseScannerActionPresentation,
  normalizePurchaseScanResult,
  resolvePurchaseScanProduct,
  type PurchaseProductSelectionState,
} from '../src/ui/purchases/purchase-barcode-scanner';

function summary(id: string, stock = 10): ProductSummary {
  return {
    product: createProduct({
      id,
      inventoryId: 'inventory-1',
      name: `Product ${id}`,
      barcode: `00${id}`,
      regularSalePrice: Money.fromDecimal('1.25'),
      createdAt: 1,
      updatedAt: 1,
    }),
    state: createInventoryState({
      stock,
      unitCost: stock === 0 ? null : Money.fromDecimal('0.5'),
    }),
    isLowStock: stock <= 0,
  };
}

function selectionState(
  selectedProduct: ProductSummary | null,
): PurchaseProductSelectionState {
  return {
    selectedProduct,
    searchText: 'coca',
    quantityText: '10',
    unitCostText: '0,70',
    submitError: 'previous error',
  };
}

test('normalizes one safe Purchase scan result and rejects ambiguous params', () => {
  assert.deepEqual(normalizePurchaseScanResult(' product-1 ', ' scan-1 '), {
    productId: 'product-1',
    requestId: 'scan-1',
  });

  for (const [productId, requestId] of [
    [undefined, undefined],
    ['', 'scan-1'],
    ['product-1', '   '],
    [['product-1'], 'scan-1'],
    ['product-1', ['scan-1']],
  ] as const) {
    assert.equal(normalizePurchaseScanResult(productId, requestId), null);
  }
});

test('consumes each Purchase result once and accepts a later scan session', () => {
  const gate = createPurchaseScanResultGate();

  assert.equal(gate.tryConsume('scan-1'), true);
  assert.equal(gate.tryConsume('scan-1'), false);
  assert.equal(gate.tryConsume('scan-2'), true);
});

test('native Purchase exposes scanner while Web keeps manual selection', () => {
  assert.deepEqual(getPurchaseScannerActionPresentation('ios'), {
    label: 'Escanear producto',
    enabled: true,
    status: null,
  });
  assert.deepEqual(getPurchaseScannerActionPresentation('android'), {
    label: 'Escanear producto',
    enabled: true,
    status: null,
  });
  assert.deepEqual(getPurchaseScannerActionPresentation('web'), {
    label: 'Escanear producto',
    enabled: false,
    status: 'Solo móvil',
  });
});

test('positive, zero and negative stock Products remain selectable', () => {
  for (const stock of [7, 0, -3]) {
    const product = summary(`stock-${stock}`, stock);
    const result = normalizePurchaseScanResult(
      product.product.id,
      `scan-${stock}`,
    )!;

    assert.strictEqual(resolvePurchaseScanProduct([product], result), product);
  }
});

test('missing or archived-filtered Product cannot replace the selection', () => {
  const current = summary('current');
  const result = normalizePurchaseScanResult('archived', 'scan-1')!;
  const before = selectionState(current);
  const match = resolvePurchaseScanProduct([], result);
  const after =
    match === null ? before : applyPurchaseProductSelection(before, match);

  assert.equal(match, null);
  assert.strictEqual(after, before);
});

test('manual and scanned selection use the exact same form transition', () => {
  const current = summary('product-a');
  const next = summary('product-b');
  const before = selectionState(current);
  const matched = resolvePurchaseScanProduct(
    [next],
    normalizePurchaseScanResult('product-b', 'scan-1')!,
  );

  assert.notEqual(matched, null);
  assert.deepEqual(
    applyPurchaseProductSelection(before, matched!),
    applyPurchaseProductSelection(before, next),
  );
  assert.deepEqual(applyPurchaseProductSelection(before, next), {
    selectedProduct: next,
    searchText: '',
    quantityText: '',
    unitCostText: '',
    submitError: null,
  });
});

test('scanning the selected Product never increments Purchase quantity', () => {
  const product = summary('product-a');
  const before = selectionState(product);
  const first = applyPurchaseProductSelection(before, product);
  const gate = createPurchaseScanResultGate();

  assert.equal(gate.tryConsume('scan-1'), true);
  assert.equal(first.quantityText, '');
  assert.equal(gate.tryConsume('scan-1'), false);
  assert.equal(first.selectedProduct, product);
});

test('Purchase screen wires scanner selection into the existing submit only', () => {
  const screenSource = readFileSync(
    fileURLToPath(new URL('../src/app/purchase.tsx', import.meta.url)),
    'utf8',
  );

  assert.match(screenSource, /createPurchaseBarcodeScannerRoute/);
  assert.match(screenSource, /applyPurchaseProductSelection/);
  assert.match(screenSource, /purchaseServices\.registerPurchase\.execute/);
  assert.equal(
    screenSource.match(/purchaseServices\.registerPurchase\.execute/g)?.length,
    1,
  );
  assert.doesNotMatch(screenSource, /scan(?:ned)?[^\n]*quantity\s*[+]/i);
});

async function registerAfterSelection(source: 'manual' | 'scanner') {
  const product = summary('product-a', -3);
  const before = selectionState(null);
  const result = normalizePurchaseScanResult('product-a', 'scan-1')!;
  const match =
    source === 'scanner'
      ? resolvePurchaseScanProduct([product], result)
      : product;

  assert.notEqual(match, null);

  const selection = applyPurchaseProductSelection(before, match!);
  const savedPurchases: Purchase[] = [];
  const savedMovements: InventoryMovement[] = [];
  const updatedStates: UpdateInventoryStateInput[] = [];
  const neverUsed = async (): Promise<never> => {
    throw new Error('Repository operation is outside this Purchase flow.');
  };
  const repositories: TransactionRepositories = {
    productRepository: {
      async listByInventory() {
        return [product.product];
      },
      save: neverUsed,
    },
    inventoryStateRepository: {
      async listByInventory() {
        return [
          {
            inventoryId: product.product.inventoryId,
            productId: product.product.id,
            state: product.state,
          },
        ];
      },
      save: neverUsed,
      async update(input) {
        updatedStates.push(input);
      },
    },
    inventoryMovementRepository: {
      async save(movement) {
        savedMovements.push(movement);
      },
    },
    purchaseRepository: {
      async save(purchase) {
        savedPurchases.push(purchase);
      },
    },
    saleRepository: { save: neverUsed },
    saleItemRepository: { save: neverUsed },
    stockAdjustmentRepository: { save: neverUsed },
    saleVoidRepository: {
      findSale: neverUsed,
      listSaleItems: neverUsed,
      listOriginalSaleMovements: neverUsed,
      listReversals: neverUsed,
      listProductMovementsAtOrAfter: neverUsed,
      listInventoryStates: neverUsed,
      saveReversal: neverUsed,
      updateInventoryState: neverUsed,
      updateSale: neverUsed,
    },
    purchaseVoidRepository: {
      findPurchase: neverUsed,
      listOriginalPurchaseMovements: neverUsed,
      listReversals: neverUsed,
      listProductMovementsAtOrAfter: neverUsed,
      listInventoryStates: neverUsed,
      saveReversal: neverUsed,
      updateInventoryState: neverUsed,
      updatePurchase: neverUsed,
    },
  };
  let purchaseId = 0;
  let movementId = 0;
  const useCase = new RegisterPurchaseUseCase({
    purchaseIdGenerator: {
      generate: () => `purchase-${++purchaseId}`,
    },
    inventoryMovementIdGenerator: {
      generate: () => `movement-${++movementId}`,
    },
    clock: { now: () => 1_776_444_000_000 },
    transactionManager: {
      runInTransaction: (operation) => operation(repositories),
    },
  });

  assert.equal(savedPurchases.length, 0);
  assert.equal(savedMovements.length, 0);
  assert.equal(updatedStates.length, 0);

  const purchaseResult = await useCase.execute({
    inventoryId: product.product.inventoryId,
    productId: selection.selectedProduct!.product.id,
    quantity: 5,
    unitCost: Money.fromDecimal('0.75'),
  });

  return {
    purchaseResult,
    savedPurchases,
    savedMovements,
    updatedStates,
  };
}

test('scanned and manual Product selection persist the same normal Purchase', async () => {
  const manual = await registerAfterSelection('manual');
  const scanner = await registerAfterSelection('scanner');

  assert.deepEqual(scanner, manual);
  assert.equal(scanner.savedPurchases.length, 1);
  assert.equal(scanner.savedMovements.length, 1);
  assert.equal(scanner.updatedStates.length, 1);
  assert.equal(scanner.purchaseResult.afterInventoryState.stock, 2);
  assert.equal(
    scanner.purchaseResult.afterInventoryState.unitCost?.scaledUnits,
    750_000,
  );
  assert.equal(scanner.purchaseResult.priceAnalysis.costChanged, true);
  assert.notEqual(
    scanner.purchaseResult.priceAnalysis.suggestedSalePrice,
    null,
  );
});
