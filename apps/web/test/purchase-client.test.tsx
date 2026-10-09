import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import { createApiClient, ApiClientError } from '../src/api/client.js';
import {
  createPurchasesClient,
  recoverPurchase,
} from '../src/purchases/client.js';
import { buildPurchase } from '../src/purchases/input.js';
import {
  PurchaseFacts,
  PurchaseConfirmation,
} from '../src/routes/purchase-confirmation.js';
import { purchaseDetailOptions } from '../src/purchases/queries.js';
import { productScope } from '../src/products/controller.js';
import { PurchasesContext } from '../src/purchases/context.js';
import { ProductsContext } from '../src/products/context.js';
import { SessionProvider } from '../src/auth/context.js';
import { prepareSale } from '../src/sales/cart.js';
import {
  saleResult as existingSaleResult,
  saleProduct,
  initialCart,
} from './sale-fixtures.js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
  purchaseProduct,
  purchaseForm,
  purchaseResult,
  purchaseReceipt,
  purchaseDetail,
  purchaseCsrf,
  purchasesFixture,
} from './purchase-fixtures.js';
import {
  inventoryId,
  operationId,
  productId,
  json,
  failure,
} from './product-fixtures.js';
const signal = () => new AbortController().signal;
const command = () => buildPurchase(purchaseForm(), purchaseProduct);
const client = (fetcher: typeof fetch) =>
  createPurchasesClient(
    createApiClient({ baseUrl: 'https://api.example.test', fetcher }),
  );
test('shared Purchase result preserves exact server weighted average and acceptance metadata snapshot', async () => {
  const cmd = command(),
    result = purchaseResult(cmd);
  createSchemaValidator(contractSchemas.RegisterPurchaseResult)(result);
  assert.equal(result.purchase.averageCostAfter, '10666667');
  assert.equal(result.product.regularSalePrice, '15000000');
  assert.equal(result.product.metadataRevision, '0');
  const data = await client(async (input) =>
    String(input).endsWith('/csrf') ? purchaseCsrf() : json(result),
  ).register(inventoryId.toUpperCase(), cmd, signal(), () => {});
  assert.deepEqual(data, result);
});
for (const defect of [
  'shape',
  'purchase-id',
  'purchase-inventory',
  'purchase-product',
  'quantity',
  'cost',
  'total',
  'product-id',
  'product-inventory',
  'archived-product',
  'before-id',
  'before-inventory',
  'before-revision',
  'before-stock',
  'before-cost',
  'after-id',
  'after-inventory',
  'after-stock',
  'after-cost',
  'after-movement',
  'movement-id',
  'movement-inventory',
  'movement-product',
  'movement-source',
  'movement-type',
  'movement-quantity',
  'analysis-cost',
  'analysis-price',
] as const)
  test(`Purchase result rejects ${defect}`, async () => {
    const cmd = command(),
      r = purchaseResult(cmd);
    let body: unknown = r;
    switch (defect) {
      case 'shape':
        body = {};
        break;
      case 'purchase-id':
        r.purchase.id = operationId;
        break;
      case 'purchase-inventory':
        r.purchase.inventoryId = operationId;
        break;
      case 'purchase-product':
        r.purchase.productId = operationId;
        break;
      case 'quantity':
        r.purchase.quantity++;
        break;
      case 'cost':
        r.purchase.unitCost = '0';
        break;
      case 'total':
        r.purchase.totalAmount = '0';
        break;
      case 'product-id':
        r.product = { ...r.product, id: operationId };
        break;
      case 'product-inventory':
        r.product = { ...r.product, inventoryId: operationId };
        break;
      case 'archived-product':
        r.product = { ...r.product, isArchived: true };
        break;
      case 'before-id':
        r.beforeState.productId = operationId;
        break;
      case 'before-inventory':
        r.beforeState.inventoryId = operationId;
        break;
      case 'before-revision':
        r.beforeState.stateRevision = '0';
        break;
      case 'before-stock':
        r.beforeState.stock--;
        break;
      case 'before-cost':
        r.beforeState.unitCost = null;
        break;
      case 'after-id':
        r.afterState.productId = operationId;
        break;
      case 'after-inventory':
        r.afterState.inventoryId = operationId;
        break;
      case 'after-stock':
        r.afterState.stock++;
        break;
      case 'after-cost':
        r.afterState.unitCost = '0';
        break;
      case 'after-movement':
        r.afterState.lastMovementId = operationId;
        break;
      case 'movement-id':
        r.movement.id = operationId;
        break;
      case 'movement-inventory':
        r.movement.inventoryId = operationId;
        break;
      case 'movement-product':
        r.movement.productId = operationId;
        break;
      case 'movement-source':
        r.movement.sourceId = operationId;
        break;
      case 'movement-type':
        r.movement.type = 'SALE';
        break;
      case 'movement-quantity':
        r.movement.quantityDelta = -10;
        break;
      case 'analysis-cost':
        r.priceAnalysis.currentUnitCost = '0';
        break;
      case 'analysis-price':
        r.priceAnalysis.regularSalePrice = '0';
        break;
    }
    await assert.rejects(
      client(async (input) =>
        String(input).endsWith('/csrf') ? purchaseCsrf() : json(body),
      ).register(inventoryId, cmd, signal(), () => {}),
      (e) => e instanceof ApiClientError && e.kind === 'INVALID_JSON',
    );
  });
for (const defect of [
  'missing',
  'extra-purchase',
  'foreign',
  'voided',
  'product',
  'state',
  'movement',
  'other-upsert',
  'wrong-command',
] as const)
  test(`public Purchase receipt rejects ${defect} without creating analysis`, () => {
    const cmd = command(),
      receipt = purchaseReceipt(cmd);
    assert.ok(receipt.status === 'ACCEPTED');
    const up = receipt.changeSet.upserts;
    switch (defect) {
      case 'missing':
        up.purchases = [];
        break;
      case 'extra-purchase':
        up.purchases.push(up.purchases[0]);
        break;
      case 'foreign':
        up.purchases[0].inventoryId = operationId;
        break;
      case 'voided':
        up.purchases[0].status = 'VOIDED';
        break;
      case 'product':
        up.products[0] = { ...up.products[0], id: operationId };
        break;
      case 'state':
        up.inventoryStates[0].inventoryId = operationId;
        break;
      case 'movement':
        up.inventoryMovements[0].sourceId = operationId;
        break;
      case 'other-upsert':
        up.sales.push(
          existingSaleResult(prepareSale(initialCart(), [saleProduct]).command)
            .sale,
        );
        break;
      case 'wrong-command':
        break;
    }
    assert.throws(
      () =>
        recoverPurchase(
          receipt,
          inventoryId,
          defect === 'wrong-command' ? command() : undefined,
        ),
      ApiClientError,
    );
  });
for (const defect of [
  'shape',
  'id',
  'inventory',
  'total',
  'stock',
  'analysis-extra',
] as const)
  test(`Purchase detail rejects ${defect}`, async () => {
    const cmd = command(),
      detail = purchaseDetail(cmd);
    let body: unknown = detail;
    switch (defect) {
      case 'shape':
        body = {};
        break;
      case 'id':
        detail.purchase.id = operationId;
        break;
      case 'inventory':
        detail.purchase.inventoryId = operationId;
        break;
      case 'total':
        detail.purchase.totalAmount = '0';
        break;
      case 'stock':
        detail.purchase.stockAfter++;
        break;
      case 'analysis-extra':
        body = { ...detail, priceAnalysis: purchaseResult(cmd).priceAnalysis };
        break;
    }
    await assert.rejects(
      client(async () => json(body)).detail(
        inventoryId,
        cmd.payload.purchaseId,
        signal(),
      ),
      ApiClientError,
    );
  });
test('detail404 replaces cached Purchase by null with own session key', async (t) => {
  const ctx = purchasesFixture(async () => failure(404, 'NOT_FOUND'));
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  const cmd = command(),
    options = purchaseDetailOptions(
      ctx.purchaseClient,
      productScope(ctx.controller)!,
      cmd.payload.purchaseId,
    );
  ctx.queries.setQueryData(options.queryKey, purchaseDetail(cmd));
  assert.equal(
    await ctx.queries.fetchQuery({ ...options, staleTime: 0 }),
    null,
  );
  assert.equal(ctx.queries.getQueryData(options.queryKey), null);
});
for (const status of ['CONFIRMED', 'VOIDED'] as const)
  for (const cost of [null, '0', '10000000'])
    test(`${status} historical Purchase before cost ${cost} renders stock/total without recommendation or void action`, () => {
      const cmd = buildPurchase(purchaseForm(), {
          ...purchaseProduct,
          state: {
            ...purchaseProduct.state,
            stock: cost === null ? -3 : 20,
            unitCost: cost,
          },
        }),
        p = { ...purchaseResult(cmd).purchase, status };
      const html = renderToStaticMarkup(
        <PurchaseFacts purchase={p} currency="EUR" timeZone="Europe/Madrid" />,
      );
      assert.ok(
        html.includes(
          status === 'VOIDED' ? 'Compra anulada' : 'Compra registrada',
        ),
      );
      assert.ok(html.includes('120.00 EUR'));
      assert.ok(
        html.includes(
          cost === null
            ? 'No disponible'
            : cost === '0'
              ? '0.00 EUR'
              : '10.00 EUR',
        ),
      );
      assert.doesNotMatch(
        html,
        /Margen deseado|Actualizar precio|<button|Anular|Undo/,
      );
      assert.match(html, /Stock antes/);
    });
test('detail needs only Purchase GET; Product404 is optional presentation and cannot erase history', async (t) => {
  const cmd = command(),
    detail = purchaseDetail(cmd),
    paths: string[] = [];
  const ctx = purchasesFixture(async (input) => {
    paths.push(String(input));
    return String(input).includes('/purchases/')
      ? json(detail)
      : failure(404, 'NOT_FOUND');
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  assert.deepEqual(
    await ctx.purchaseClient.detail(
      inventoryId,
      cmd.payload.purchaseId,
      signal(),
    ),
    detail,
  );
  assert.equal(await ctx.client.detail(inventoryId, productId, signal()), null);
  assert.equal(paths.length, 2);
  assert.equal(detail.purchase.status, 'CONFIRMED');
  assert.ok(!('priceAnalysis' in detail));
});
for (const code of [
  'UNAUTHENTICATED',
  'CLOUD_ACCESS_DISABLED',
  'BUSINESS_DELETING',
  'RATE_LIMITED',
] as const)
  test(`detail HTTP ${code} remains safe`, async () => {
    const status =
      code === 'UNAUTHENTICATED' ? 401 : code === 'RATE_LIMITED' ? 429 : 403;
    await assert.rejects(
      client(async () => failure(status, code)).detail(
        inventoryId,
        operationId,
        signal(),
      ),
      ApiClientError,
    );
  });
test('confirmation uses accepted result and Application recommendation; invalid margin cannot write, sufficient price has no lowering CTA', async (t) => {
  let patches = 0;
  const ctx = purchasesFixture(async (input, options) => {
    if (String(input).endsWith('/csrf')) return purchaseCsrf();
    if (options?.method === 'POST')
      return json(purchaseResult(JSON.parse(String(options.body))));
    if (options?.method === 'PATCH') {
      patches++;
      return json({});
    }
    return json(purchaseProduct);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await ctx.purchases.prepare(purchaseForm());
  function html() {
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <SessionProvider controller={ctx.controller}>
            <ProductsContext.Provider value={ctx.products}>
              <PurchasesContext.Provider value={ctx.purchases}>
                <PurchaseConfirmation currency="EUR" timeZone="UTC" />
              </PurchasesContext.Provider>
            </ProductsContext.Provider>
          </SessionProvider>
        ),
      },
    ]);
    const result = renderToStaticMarkup(<RouterProvider router={router} />);
    router.dispose();
    return result;
  }
  assert.match(html(), /Margen deseado/);
  assert.match(html(), /Actualizar precio de venta/);
  ctx.purchases.editMargin('0');
  assert.match(html(), /No necesitas reducirlo/);
  assert.doesNotMatch(html(), /Actualizar precio de venta a/);
  ctx.purchases.editMargin('100');
  assert.match(html(), /Ingresa un margen/);
  await ctx.purchases.applyPrice();
  assert.equal(patches, 0);
  ctx.purchases.editMargin('');
  assert.doesNotMatch(html(), /Ingresa un margen/);
  ctx.purchases.keepPrice();
  assert.doesNotMatch(html(), /id="desired-margin"/);
  assert.equal(patches, 0);
});
