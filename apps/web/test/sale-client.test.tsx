import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryObserver } from '@tanstack/react-query';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import { createApiClient, ApiClientError } from '../src/api/client.js';
import { createSalesClient, recoverSale } from '../src/sales/client.js';
import { saleDetailOptions } from '../src/sales/queries.js';
import { salesKey } from '../src/sales/controller.js';
import { productScope, productsKey } from '../src/products/controller.js';
import { addProduct, editPrice, prepareSale } from '../src/sales/cart.js';
import {
  CartLines,
  StockWarningPanel,
  SaleFacts,
  formatSaleTime,
} from '../src/routes/sales.js';
import {
  saleProduct,
  secondProduct,
  initialCart,
  saleResult,
  saleDetail,
  saleReceipt,
  salesFixture,
  csrf,
  settledSale,
} from './sale-fixtures.js';
import {
  inventoryId,
  operationId,
  productId,
  json,
  failure,
} from './product-fixtures.js';

const signal = () => new AbortController().signal;
const command = () =>
  prepareSale(addProduct(initialCart(), secondProduct), [
    saleProduct,
    secondProduct,
  ]).command;
const client = (fetcher: typeof fetch) =>
  createSalesClient(
    createApiClient({ baseUrl: 'https://api.example.test', fetcher }),
  );
test('registration accepts a shared multi-line response and matches every item/state/movement to the command', async () => {
  const cmd = command(),
    result = saleResult(cmd);
  createSchemaValidator(contractSchemas.RegisterSaleResult)(result);
  const resultRead = await client(async (input) =>
    String(input).endsWith('/csrf') ? csrf() : json(result),
  ).register(inventoryId.toUpperCase(), cmd, signal(), () => {});
  assert.deepEqual(resultRead, result);
  assert.equal(result.sale.estimatedCost, null);
  assert.equal(result.sale.estimatedProfit, null);
});
for (const defect of [
  'shape',
  'inventory',
  'sale-id',
  'item-inventory',
  'item-sale',
  'item-price',
  'item-quantity',
  'missing-item',
  'duplicate-item',
  'duplicate-product',
  'foreign-state',
  'duplicate-state',
  'foreign-movement',
  'duplicate-movement',
  'movement-id',
  'movement-source',
  'snapshot',
  'aggregate',
] as const)
  test(`registration rejects ${defect} instead of confirming an inconsistent success`, async () => {
    const cmd = command(),
      result = saleResult(cmd);
    let body: unknown = result;
    switch (defect) {
      case 'shape':
        body = {};
        break;
      case 'inventory':
        result.sale.inventoryId = operationId;
        break;
      case 'sale-id':
        result.sale.id = operationId;
        break;
      case 'item-inventory':
        result.items[0].inventoryId = operationId;
        break;
      case 'item-sale':
        result.items[0].saleId = operationId;
        break;
      case 'item-price':
        result.items[0].unitSalePrice = '9000000';
        break;
      case 'item-quantity':
        result.items[0].quantity++;
        break;
      case 'missing-item':
        result.items.pop();
        break;
      case 'duplicate-item':
        result.items[1] = result.items[0];
        break;
      case 'duplicate-product':
        result.items[1].productId = result.items[0].productId;
        break;
      case 'foreign-state':
        result.states[0].inventoryId = operationId;
        break;
      case 'duplicate-state':
        result.states[1] = result.states[0];
        break;
      case 'foreign-movement':
        result.movements[0].inventoryId = operationId;
        break;
      case 'duplicate-movement':
        result.movements[1] = result.movements[0];
        break;
      case 'movement-id':
        result.movements[0].id = operationId;
        break;
      case 'movement-source':
        result.movements[0].sourceId = operationId;
        break;
      case 'snapshot':
        result.items[0].unitCostSnapshot = '7000000';
        break;
      case 'aggregate':
        result.sale.estimatedProfit = '0';
        break;
    }
    await assert.rejects(
      client(async (input) =>
        String(input).endsWith('/csrf') ? csrf() : json(body),
      ).register(inventoryId, cmd, signal(), () => {}),
      (error: unknown) =>
        error instanceof ApiClientError && error.kind === 'INVALID_JSON',
    );
  });
for (const defect of [
  'missing-sale',
  'multiple-sales',
  'foreign-sale',
  'voided-sale',
  'missing-items',
  'foreign-state',
  'other-upserts',
  'wrong-command',
] as const)
  test(`recovery refuses ${defect} public ChangeSet`, () => {
    const cmd = command(),
      receipt = saleReceipt(cmd);
    assert.equal(receipt.status, 'ACCEPTED');
    if (receipt.status !== 'ACCEPTED') throw new Error('Fixture');
    const changes = receipt.changeSet.upserts;
    switch (defect) {
      case 'missing-sale':
        changes.sales = [];
        break;
      case 'multiple-sales':
        changes.sales.push({ ...changes.sales[0], id: operationId });
        break;
      case 'foreign-sale':
        changes.sales[0].inventoryId = operationId;
        break;
      case 'voided-sale':
        changes.sales[0].status = 'VOIDED';
        break;
      case 'missing-items':
        changes.saleItems = [];
        break;
      case 'foreign-state':
        changes.inventoryStates[0].inventoryId = operationId;
        break;
      case 'other-upserts':
        changes.products = [saleProduct.product];
        break;
      case 'wrong-command':
        break;
    }
    assert.throws(
      () =>
        recoverSale(
          receipt,
          inventoryId,
          defect === 'wrong-command' ? command() : undefined,
        ),
      ApiClientError,
    );
  });
for (const defect of [
  'shape',
  'sale-inventory',
  'sale-id',
  'item-inventory',
  'item-sale',
  'duplicate-item',
  'unknown-fields',
  'bad-subtotal',
  'extra-field',
] as const)
  test(`detail rejects ${defect} with safe invalid JSON`, async () => {
    const cmd = command(),
      detail = saleDetail(cmd);
    let body: unknown = detail;
    switch (defect) {
      case 'shape':
        body = {};
        break;
      case 'sale-inventory':
        detail.sale.inventoryId = operationId;
        break;
      case 'sale-id':
        detail.sale.id = operationId;
        break;
      case 'item-inventory':
        detail.items[0].inventoryId = operationId;
        break;
      case 'item-sale':
        detail.items[0].saleId = operationId;
        break;
      case 'duplicate-item':
        detail.items[1] = detail.items[0];
        break;
      case 'unknown-fields':
        body = {
          ...detail,
          items: detail.items.map((i) => ({
            ...i,
            unitCostSnapshot: null,
            estimatedCost: null,
            estimatedProfit: null,
          })),
        };
        break;
      case 'bad-subtotal':
        detail.items[0].subtotal = '1';
        break;
      case 'extra-field':
        body = { ...detail, currentUnitCost: '0' };
        break;
    }
    await assert.rejects(
      client(async () => json(body)).detail(
        inventoryId,
        cmd.payload.saleId,
        signal(),
      ),
      (error: unknown) =>
        error instanceof ApiClientError && error.kind === 'INVALID_JSON',
    );
  });
test('detail validates case-insensitive own references and requires only a scoped Sale GET', async () => {
  const cmd = command(),
    detail = saleDetail(cmd),
    paths: string[] = [];
  const data = await client(async (input, options) => {
    paths.push(String(input));
    assert.equal(options?.method, 'GET');
    assert.equal(new Headers(options?.headers).get('X-CSRF-Token'), null);
    return json(detail);
  }).detail(
    inventoryId.toUpperCase(),
    cmd.payload.saleId.toUpperCase(),
    signal(),
  );
  assert.deepEqual(data, detail);
  assert.equal(paths.length, 1);
  assert.ok(paths[0].includes('/sales/'));
  assert.ok(!paths[0].includes('/products/'));
});
for (const status of [401, 403, 429, 500])
  test(`detail HTTP ${status} reaches the existing auth/rate/error boundary`, async () => {
    const code =
      status === 401
        ? 'UNAUTHENTICATED'
        : status === 403
          ? 'CLOUD_ACCESS_DISABLED'
          : status === 429
            ? 'RATE_LIMITED'
            : 'INTERNAL_ERROR';
    await assert.rejects(
      client(async () => failure(status, code)).detail(
        inventoryId,
        operationId,
        signal(),
      ),
      (error: unknown) =>
        error instanceof ApiClientError && error.status === status,
    );
  });
test('detail404 replaces stale cached Sale with null using a full session scoped query key', async (t) => {
  const cmd = command(),
    ctx = salesFixture(async () => failure(404));
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  const key = salesKey(scope, 'detail', cmd.payload.saleId);
  ctx.queries.setQueryData(key, saleDetail(cmd));
  await ctx.queries.fetchQuery({
    ...saleDetailOptions(ctx.sales.client, scope, cmd.payload.saleId),
    staleTime: 0,
  });
  assert.equal(ctx.queries.getQueryData(key), null);
  assert.deepEqual(key, [
    'private',
    scope.generation,
    scope.businessId,
    scope.inventoryId,
    'sales',
    'detail',
    cmd.payload.saleId,
  ]);
});
for (const status of ['CONFIRMED', 'VOIDED'] as const)
  test(`historical ${status} detail retains snapshots, null aggregates, nullable metadata and has no void action`, () => {
    const cmd = command(),
      detail = saleDetail(cmd);
    detail.sale.status = status;
    detail.items[0].productName = null;
    const before = JSON.stringify(detail),
      html = renderToStaticMarkup(
        <SaleFacts detail={detail} currency="USD" timeZone="UTC" />,
      );
    assert.ok(
      html.includes(status === 'VOIDED' ? 'Venta anulada' : 'Confirmada'),
    );
    assert.match(html, /Producto no disponible/);
    assert.match(html, /Costo no disponible/);
    assert.match(html, /Ganancia no disponible/);
    assert.match(html, /-0\.77/);
    assert.ok(
      !html.includes('Anular venta') &&
        !html.includes('Undo') &&
        !html.includes('voidEligibility'),
    );
    assert.equal(JSON.stringify(detail), before);
  });
for (const cost of ['0', '1234567'] as const)
  test(`known historical cost ${cost} and zero profit remain available with exact totals`, () => {
    const read = {
        ...saleProduct,
        state: { ...saleProduct.state, unitCost: cost },
      },
      cmd = prepareSale(initialCart(), [read]).command;
    const detail = saleDetail(cmd),
      html = renderToStaticMarkup(
        <SaleFacts detail={detail} currency="USD" timeZone="Europe/Madrid" />,
      );
    assert.ok(!html.includes('Costo no disponible'));
    assert.match(
      html,
      cost === '0' ? /0\.00/ : /Ganancia estimada<\/dt><dd>0\.00/,
    );
  });
test('detail uses reporting timezone and handles an unrepresentable date safely without browser timezone fallback', () => {
  const timestamp = Date.parse('2026-02-17T00:30:00Z');
  assert.match(formatSaleTime(timestamp, 'UTC'), /0:30/);
  assert.match(formatSaleTime(timestamp, 'America/New_York'), /19:30/);
  assert.match(formatSaleTime(timestamp, 'Europe/Madrid'), /1:30/);
  assert.equal(
    formatSaleTime(Number.MAX_SAFE_INTEGER, 'UTC'),
    'Fecha no disponible',
  );
});
test('cart markup has labels, quantities, errors, exact two-decimal display and positive-price requirement', () => {
  const cart = editPrice(initialCart(), productId, 'bad');
  const before = JSON.stringify(cart);
  const html = renderToStaticMarkup(
    <CartLines
      cart={cart}
      currency="EUR"
      locked={false}
      change={() => {}}
      unavailable={[productId]}
    />,
  );
  for (const label of [
    'Carrito',
    'Precio de venta por unidad',
    'Cantidad de',
    'Quitar',
    'Producto no disponible',
    'Total:',
    'Subtotal:',
  ])
    assert.ok(html.includes(label));
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="sale-price-0-message"/);
  assert.ok(html.includes('value="bad"'));
  assert.equal(JSON.stringify(cart), before);
});
test('stock warning explains exact current/quantity/result with keyboard confirmation and review controls', () => {
  let sent = 0;
  const html = renderToStaticMarkup(
    <StockWarningPanel
      warnings={[
        { productId, name: 'Agua', stock: 3, quantity: 5, resultingStock: -2 },
      ]}
      disabled={false}
      review={() => {}}
      confirm={() => {
        sent++;
      }}
    />,
  );
  assert.match(html, /role="alert"/);
  assert.ok(
    html.includes('Tienes: 3') &&
      html.includes('Venderás: 5') &&
      html.includes('Quedará: -2'),
  );
  assert.match(html, /Revisar cantidades/);
  assert.match(html, /Registrar igualmente/);
  assert.equal(sent, 0);
});
test('barcode enters as an exact string and duplicate successful lookups increment the same cart line', async (t) => {
  const paths: string[] = [];
  const ctx = salesFixture(async (input) => {
    paths.push(String(input));
    return json(saleProduct);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  let cart = initialCart();
  for (let i = 0; i < 2; i++) {
    const read = await ctx.client.barcode(inventoryId, ' 0012345 ', signal());
    assert.ok(read);
    cart = addProduct(cart, read);
  }
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
  assert.equal(cart[0].unitSalePrice.scaledUnits, 1234567);
  assert.ok(
    paths.every((p) => p.endsWith('/products/by-barcode?code=0012345')),
  );
});
test('same-tab terminal cost receipt cannot retry and preserves the next selected-price intention', async (t) => {
  let cmd = command(),
    writes = 0;
  const ctx = salesFixture(async (input, options) => {
    if (String(input).endsWith('/csrf')) return csrf();
    if (String(input).includes('/operations/'))
      return json({
        operationId: cmd.operationId,
        status: 'CONFLICT',
        error: {
          code: 'COST_SNAPSHOT_CONFLICT',
          message: 'Public',
          requestId: 'r',
        },
      });
    if (options?.method === 'POST') {
      writes++;
      cmd = JSON.parse(String(options.body));
      throw new TypeError('lost');
    }
    return json(saleProduct);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.sales.prepare(initialCart());
  await ctx.sales.check();
  assert.equal(ctx.sales.snapshot().kind, 'ERROR');
  await ctx.sales.retry();
  assert.equal(writes, 1);
  assert.equal(ctx.values.size, 0);
});
test('Product queries refetch only after accepted Sale; server state replaces cache through GET', async (t) => {
  let current = saleProduct,
    gets = 0;
  const ctx = salesFixture(async (input, options) => {
    if (String(input).endsWith('/csrf')) return csrf();
    if (options?.method === 'POST') {
      const result = saleResult(JSON.parse(String(options.body)));
      current = { ...saleProduct, state: result.states[0] };
      return json(result);
    }
    gets++;
    return json(current);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  const observer = new QueryObserver(ctx.queries, {
      queryKey: productsKey(scope, 'detail', productId),
      queryFn: ({ signal }) =>
        ctx.client.detail(inventoryId, productId, signal),
    }),
    stop = observer.subscribe(() => {});
  t.after(stop);
  await observer.refetch();
  await ctx.sales.prepare(initialCart());
  await settledSale(ctx.sales);
  assert.equal(observer.getCurrentResult().data?.state.stock, 9);
  assert.ok(gets >= 3);
});
