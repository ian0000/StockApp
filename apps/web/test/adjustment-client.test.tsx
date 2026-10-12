import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import type { AdjustStockCommandResult } from '@stock-app/contracts';
import { createApiClient, ApiClientError } from '../src/api/client.js';
import {
  createAdjustmentsClient,
  recoverAdjustment,
} from '../src/adjustments/client.js';
import {
  buildAdjustment,
  initialAdjustmentForm,
} from '../src/adjustments/input.js';
import { AdjustmentsContext } from '../src/adjustments/context.js';
import { SessionProvider } from '../src/auth/context.js';
import { Providers } from '../src/app/providers.js';
import { productScope, productsKey } from '../src/products/controller.js';
import { NewAdjustmentPage } from '../src/routes/adjustments.js';
import {
  inventoryId,
  productId,
  operationId,
  json,
} from './product-fixtures.js';
import {
  adjustmentProduct,
  adjustmentForm,
  adjustmentResult,
  adjustmentReceipt,
  adjustmentsFixture,
} from './adjustment-fixtures.js';
const command = () => buildAdjustment(adjustmentForm(), adjustmentProduct);
const client = (fetcher: typeof fetch) =>
  createAdjustmentsClient(
    createApiClient({ baseUrl: 'https://api.example.test', fetcher }),
  );
test('shared result validates and server average remains authoritative exact six decimals', async () => {
  const cmd = buildAdjustment(
      {
        ...adjustmentForm(),
        actualStock: '30',
        costMode: 'CUSTOM_COST',
        customUnitCost: '12',
      },
      {
        ...adjustmentProduct,
        state: { ...adjustmentProduct.state, stock: 20 },
      },
    ),
    r = adjustmentResult(cmd);
  createSchemaValidator(contractSchemas.AdjustStockResult)(r);
  assert.equal(r.state.unitCost, '10666667');
  const response = await client(async (input) =>
    String(input).endsWith('/csrf') ? json({ token: 'csrf' }) : json(r),
  ).register(
    inventoryId.toUpperCase(),
    cmd,
    new AbortController().signal,
    () => {},
  );
  assert.deepEqual(response, r);
});
const mutations: Record<string, (r: AdjustStockCommandResult) => void> = {
  'adjustment identity': (r) => {
    r.adjustment.id = operationId;
  },
  'adjustment scope': (r) => {
    r.adjustment.inventoryId = operationId;
  },
  'adjustment product': (r) => {
    r.adjustment.productId = operationId;
  },
  'stock before': (r) => {
    r.adjustment.stockBefore--;
  },
  'physical count': (r) => {
    r.adjustment.actualStock++;
  },
  difference: (r) => {
    r.adjustment.difference++;
  },
  'positive reason': (r) => {
    r.adjustment.reason = 'DAMAGED';
  },
  'reason mismatch': (r) => {
    r.adjustment.reason = 'OTHER';
  },
  'cost mode': (r) => {
    r.adjustment.costMode = 'CUSTOM_COST';
  },
  'applied cost': (r) => {
    r.adjustment.unitCost = '0';
  },
  'effective time': (r) => {
    r.adjustment.effectiveAt++;
  },
  'state inventory': (r) => {
    r.state.inventoryId = operationId;
  },
  'state product': (r) => {
    r.state.productId = operationId;
  },
  'state stock': (r) => {
    r.state.stock++;
  },
  'state cost': (r) => {
    r.state.unitCost = '0';
  },
  'state revision': (r) => {
    r.state.stateRevision = '0';
  },
  'state movement': (r) => {
    r.state.lastMovementId = operationId;
  },
  'movement id': (r) => {
    r.movement.id = operationId;
  },
  'movement inventory': (r) => {
    r.movement.inventoryId = operationId;
  },
  'movement product': (r) => {
    r.movement.productId = operationId;
  },
  'movement type': (r) => {
    r.movement.type = 'PURCHASE';
  },
  'movement delta': (r) => {
    r.movement.quantityDelta++;
  },
  'movement source type': (r) => {
    r.movement.sourceType = 'PURCHASE';
  },
  'movement source id': (r) => {
    r.movement.sourceId = operationId;
  },
  'movement before': (r) => {
    r.movement.stockBefore--;
  },
  'movement after': (r) => {
    r.movement.stockAfter++;
  },
  'movement snapshot': (r) => {
    r.movement.unitCostSnapshot = '0';
  },
  reversal: (r) => {
    r.movement.reversalOfMovementId = operationId;
  },
  metadata: (r) => {
    r.movement.metadata = 'unexpected';
  },
  'movement time': (r) => {
    r.movement.createdAt++;
  },
};
for (const [name, mutate] of Object.entries(mutations))
  test(`reject incoherent result ${name}`, async () => {
    const cmd = command(),
      r = adjustmentResult(cmd);
    mutate(r);
    await assert.rejects(
      client(async (input) =>
        String(input).endsWith('/csrf') ? json({ token: 'csrf' }) : json(r),
      ).register(inventoryId, cmd, new AbortController().signal, () => {}),
      (error) =>
        error instanceof ApiClientError && error.kind === 'INVALID_JSON',
    );
  });
for (const actual of ['8', '12'])
  test(`receipt ${actual} uses public ChangeSet, valid adjustment movement and no Sale/Purchase`, () => {
    const cmd = buildAdjustment(
        { ...adjustmentForm(), actualStock: actual },
        adjustmentProduct,
      ),
      receipt = adjustmentReceipt(cmd);
    assert.deepEqual(
      recoverAdjustment(receipt, inventoryId, cmd),
      adjustmentResult(cmd),
    );
    assert.equal(receipt.changeSet.upserts.purchases.length, 0);
    assert.equal(receipt.changeSet.upserts.sales.length, 0);
    assert.equal(
      recoverAdjustment(receipt, inventoryId).movement.type,
      actual === '8' ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
    );
    assert.ok(!('resultReferences' in receipt));
  });
for (const defect of [
  'scope',
  'missing',
  'extra adjustment',
  'source',
  'movement',
  'state',
  'cost',
  'reason',
  'negative mode',
] as const)
  test(`recovery rejects ${defect} without internal refs`, () => {
    const cmd = command(),
      receipt = adjustmentReceipt(cmd),
      up = receipt.changeSet.upserts;
    switch (defect) {
      case 'scope':
        receipt.changeSet.inventoryId = operationId;
        break;
      case 'missing':
        up.stockAdjustments = [];
        break;
      case 'extra adjustment':
        up.stockAdjustments.push(up.stockAdjustments[0]);
        break;
      case 'source':
        up.inventoryMovements[0].sourceId = operationId;
        break;
      case 'movement':
        up.inventoryMovements[0].type = 'SALE';
        break;
      case 'state':
        up.inventoryStates[0].stock++;
        break;
      case 'cost':
        up.inventoryMovements[0].unitCostSnapshot = '0';
        break;
      case 'reason':
        up.stockAdjustments[0].reason = 'DAMAGED';
        break;
      case 'negative mode':
        up.stockAdjustments[0].costMode = null;
        break;
    }
    assert.throws(
      () => recoverAdjustment(receipt, inventoryId),
      ApiClientError,
    );
  });
test('invalid direct revision never requests CSRF or POST', async () => {
  let calls = 0;
  const cmd = command();
  cmd.preconditions.expectedStateRevision = { operationId };
  await assert.rejects(
    client(async () => {
      calls++;
      return json({});
    }).register(inventoryId, cmd, new AbortController().signal, () => {}),
  );
  assert.equal(calls, 0);
});
async function render(
  actualStock: string,
  stock = 10,
  cost: string | null = '10000000',
  accepted = false,
) {
  const read = {
    ...adjustmentProduct,
    state: { ...adjustmentProduct.state, stock, unitCost: cost },
  };
  const ctx = adjustmentsFixture(async (input, options) =>
    String(input).endsWith('/csrf')
      ? json({ token: 'csrf' })
      : options?.method === 'POST'
        ? json(adjustmentResult(JSON.parse(String(options.body))))
        : json(read),
  );
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  ctx.adjustments.saveDraft(
    scope,
    { ...initialAdjustmentForm(read), actualStock },
    read,
  );
  ctx.queries.setQueryData(productsKey(scope, 'list', ''), {
    pages: [{ items: [read], nextCursor: null }],
    pageParams: [null],
  });
  if (accepted) {
    await ctx.adjustments.prepare({
      ...initialAdjustmentForm(read),
      actualStock,
    });
    await ctx.adjustments.confirm();
  }
  const router = createMemoryRouter(
    [{ path: '*', Component: NewAdjustmentPage }],
    { initialEntries: ['/adjustments/new?productId=' + productId] },
  );
  const html = renderToStaticMarkup(
    <Providers client={ctx.queries}>
      <SessionProvider controller={ctx.controller}>
        <AdjustmentsContext.Provider value={ctx.adjustments}>
          <RouterProvider router={router} />
        </AdjustmentsContext.Provider>
      </SessionProvider>
    </Providers>,
  );
  router.dispose();
  ctx.dispose();
  return html;
}
test('initial physical count stays blank, labeled input and server-search/barcode controls', async () => {
  const html = await render('');
  assert.match(html, /id="adjustment-actualStock"[^>]*value=""/);
  for (const label of [
    'Buscar productos',
    'Código de barras',
    'Conteo físico',
    'Motivo',
  ])
    assert.ok(html.includes(label));
  assert.ok(html.includes('aria-describedby="adjustment-form-error"'));
  assert.ok(html.includes('aria-live="polite"'));
});
test('negative preview hides editable costs, offers five reasons and displays signed difference', async () => {
  const html = await render('8');
  assert.ok(html.includes('-2'));
  assert.ok(html.includes('Dañado'));
  assert.ok(!html.includes('name="adjustment-cost-mode"'));
  assert.ok(!html.includes('id="adjustment-customUnitCost"'));
  assert.ok(html.includes('no cambia'));
});
test('negative stock to zero is positive, shows unknown cost/custom input and only valid reasons', async () => {
  const html = await render('0', -3, null);
  assert.ok(html.includes('+3'));
  assert.ok(html.includes('Stock registrado: -3'));
  assert.ok(html.includes('id="adjustment-customUnitCost"'));
  assert.ok(!html.includes('Dañado'));
  assert.ok(html.includes('aún no tiene costo conocido'));
});
test('no-op disables review and explains physical count matches without writes', async () => {
  const html = await render('10');
  assert.match(html, /<button type="submit" disabled="">Revisar conteo/);
  assert.ok(html.includes('ya coincide'));
});
test('accepted summary uses result stock/cost and Product links, no Undo or adjustment detail', async () => {
  const html = await render('12', 10, '0', true);
  for (const label of [
    'Stock actualizado',
    '10 → 12',
    '+2',
    '0.00',
    'Ajustar otro producto',
    'Volver a productos',
    'Ver producto',
  ])
    assert.ok(html.includes(label), label);
  assert.ok(!html.includes('Anular'));
  assert.ok(!html.includes('Undo'));
  assert.ok(!html.includes('/adjustments/' + productId));
});
