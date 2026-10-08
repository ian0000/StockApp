import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RegisterSaleCommand } from '@stock-app/contracts';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import { addProduct, editPrice, prepareSale } from '../src/sales/cart.js';
import { PENDING_SALE_KEY, salesKey } from '../src/sales/controller.js';
import { productScope, productsKey } from '../src/products/controller.js';
import { readDescriptor } from '../src/commands/pending.js';
import { deferred, identity, me } from './session-fixtures.js';
import {
  json,
  failure,
  inventoryId,
  productId,
  operationId,
} from './product-fixtures.js';
import { PENDING_PRODUCT_KEY } from '../src/products/pending.js';
import {
  salesFixture,
  saleProduct,
  secondProduct,
  initialCart,
  csrf,
  saleResult,
  saleReceipt,
  settledSale,
} from './sale-fixtures.js';

async function success(input: RequestInfo | URL, options?: RequestInit) {
  if (String(input).endsWith('/csrf')) return csrf();
  if (options?.method === 'POST')
    return json(saleResult(JSON.parse(String(options.body))));
  return json(
    String(input).endsWith(secondProduct.product.id)
      ? secondProduct
      : saleProduct,
  );
}
test('Inventory switch while warning is prepared clears the unsent intent before confirmation', async (t) => {
  let posts = 0;
  const ctx = salesFixture(async (input, options) => {
    if (options?.method === 'POST') posts++;
    if (String(input).includes('/products/'))
      return json({
        ...saleProduct,
        state: { ...saleProduct.state, stock: 0 },
      });
    return success(input, options);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.sales.prepare(initialCart());
  assert.equal(ctx.sales.snapshot().kind, 'WARNING');
  ctx.ownership.me = async () => ({
    ...me,
    inventory: { ...me.inventory!, id: operationId },
  });
  await ctx.controller.refresh();
  await ctx.sales.continuePrepared();
  assert.equal(ctx.sales.snapshot().kind, 'READY');
  assert.equal(ctx.sales.preparedCommand(), null);
  assert.equal(posts, 0);
});
for (const status of [401, 403, 429])
  test(`Sale POST ${status} clears pending and keeps safe boundary/rate-limit feedback`, async (t) => {
    const ctx = salesFixture(async (input, options) => {
      if (options?.method === 'POST')
        return failure(
          status,
          status === 401
            ? 'UNAUTHENTICATED'
            : status === 403
              ? 'CLOUD_ACCESS_DISABLED'
              : 'RATE_LIMITED',
        );
      return success(input, options);
    });
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    await ctx.sales.prepare(initialCart());
    assert.equal(ctx.values.size, 0);
    if (status === 401)
      assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
    if (status === 403) assert.equal(ctx.controller.snapshot().kind, 'ERROR');
    if (status === 429) assert.equal(ctx.sales.snapshot().kind, 'ERROR');
    assert.doesNotMatch(
      ctx.sales.snapshot().message,
      /stack|SQL|token|fingerprint/,
    );
  });
test('malformed receipt preserves the pending uncertainty and never creates another Sale', async (t) => {
  let posts = 0;
  const ctx = salesFixture(
    async () => {
      posts++;
      return json({
        status: 'ACCEPTED',
        resultReferences: { saleId: operationId },
      });
    },
    JSON.stringify({ operationId, inventoryId, commandKind: 'SALE_REGISTER' }),
  );
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await settledSale(ctx.sales);
  assert.equal(ctx.sales.snapshot().kind, 'UNCERTAIN');
  assert.equal(ctx.sales.snapshot().canRetry, false);
  assert.equal(ctx.values.size, 1);
  assert.equal(posts, 1);
  await ctx.sales.prepare(initialCart());
  assert.equal(posts, 1);
});
test('pre-submit refreshes all unique products before CSRF/POST with exact evidence and without changing the selected price', async (t) => {
  const calls: string[] = [];
  let sent: RegisterSaleCommand | undefined;
  const ctx = salesFixture(async (input, options) => {
    calls.push(String(input));
    if (options?.method === 'POST') {
      sent = JSON.parse(String(options.body));
      assert.equal(
        new Headers(options.headers).get('Idempotency-Key'),
        sent!.operationId,
      );
      assert.equal(
        new Headers(options.headers).get('X-CSRF-Token'),
        'csrf-sale',
      );
    }
    return success(input, options);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const cart = addProduct(
    editPrice(initialCart(), productId, '3.123456'),
    secondProduct,
  );
  await ctx.sales.prepare(cart);
  assert.equal(ctx.sales.snapshot().kind, 'ACCEPTED');
  assert.ok(sent);
  assert.equal(calls.filter((c) => c.includes('/products/')).length, 2);
  assert.ok(calls[2].endsWith('/csrf'));
  assert.ok(calls[3].endsWith('/sales'));
  createSchemaValidator(contractSchemas.RegisterSaleCommand)(sent);
  assert.equal(sent.payload.items[0].unitSalePrice, '3123456');
  assert.deepEqual(Object.keys(sent.preconditions), ['expectedCosts']);
});
for (const stock of [10, 1, 0, -2])
  test(`stock ${stock} requires only the approved negative-stock warning`, async (t) => {
    let sent = 0;
    const ctx = salesFixture(async (input, options) => {
      if (String(input).endsWith('/csrf')) return csrf();
      if (options?.method === 'POST') {
        sent++;
        return json(saleResult(JSON.parse(String(options.body))));
      }
      return json({ ...saleProduct, state: { ...saleProduct.state, stock } });
    });
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    await ctx.sales.prepare(initialCart());
    assert.equal(sent, stock < 1 ? 0 : 1);
    assert.equal(ctx.sales.snapshot().kind, stock < 1 ? 'WARNING' : 'ACCEPTED');
    if (stock < 1) {
      const prepared = ctx.sales.preparedCommand()!;
      assert.equal(ctx.sales.snapshot().warnings![0].resultingStock, stock - 1);
      assert.equal(ctx.values.size, 0);
      await ctx.sales.continuePrepared();
      assert.equal(sent, 1);
      assert.equal(ctx.sales.snapshot().saleId, prepared.payload.saleId);
    }
  });
test('warning confirmation sends exactly the prepared intention; review/cart edit sends nothing and discards it', async (t) => {
  let posts: RegisterSaleCommand[] = [],
    reads = 0;
  const ctx = salesFixture(async (input, options) => {
    if (String(input).endsWith('/csrf')) return csrf();
    if (options?.method === 'POST') {
      const command = JSON.parse(String(options.body));
      posts.push(command);
      return json(saleResult(command));
    }
    reads++;
    return json({ ...saleProduct, state: { ...saleProduct.state, stock: 0 } });
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.sales.prepare(initialCart());
  const old = ctx.sales.preparedCommand()!;
  ctx.sales.reviewQuantities();
  assert.equal(posts.length, 0);
  assert.equal(ctx.sales.preparedCommand(), null);
  await ctx.sales.prepare(initialCart());
  const next = ctx.sales.preparedCommand()!;
  assert.notEqual(next.operationId, old.operationId);
  ctx.sales.cartEdited();
  assert.equal(ctx.sales.preparedCommand(), null);
  assert.equal(posts.length, 0);
  await ctx.sales.prepare(initialCart());
  const last = ctx.sales.preparedCommand()!;
  await ctx.sales.continuePrepared();
  assert.deepEqual(posts[0], last);
  assert.equal(reads, 3);
});
test('missing/archived pre-submit detail marks the line and preserves cart without CSRF or command', async (t) => {
  let calls = 0;
  const ctx = salesFixture(async () => {
    calls++;
    return failure(404);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const cart = initialCart(),
    before = JSON.stringify(cart);
  await ctx.sales.prepare(cart);
  assert.equal(ctx.sales.snapshot().kind, 'ERROR');
  assert.deepEqual(ctx.sales.snapshot().unavailable, [productId]);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(cart), before);
  assert.equal(ctx.values.size, 0);
});
test('invalid price/empty/overflow never refresh or send', async (t) => {
  let calls = 0;
  const ctx = salesFixture(async () => {
    calls++;
    return json(saleProduct);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  for (const cart of [
    [],
    editPrice(initialCart(), productId, '0'),
    editPrice(initialCart(), productId, 'bad'),
    [{ ...initialCart()[0], quantity: Number.MAX_SAFE_INTEGER }],
  ]) {
    await ctx.sales.prepare(cart);
    assert.equal(ctx.sales.snapshot().kind, 'ERROR');
  }
  assert.equal(calls, 0);
});
for (const problem of [
  'network',
  'timeout',
  '500',
  '503',
  'malformed',
] as const)
  test(`${problem} keeps exact body/key, minimal descriptor and retry without new product reads`, async (t) => {
    let reads = 0,
      retry = false;
    const bodies: string[] = [];
    const ctx = salesFixture(async (input, options) => {
      if (String(input).endsWith('/csrf')) return csrf();
      if (options?.method !== 'POST') {
        reads++;
        return json(saleProduct);
      }
      bodies.push(String(options.body));
      const command: RegisterSaleCommand = JSON.parse(String(options.body));
      assert.equal(
        new Headers(options.headers).get('Idempotency-Key'),
        command.operationId,
      );
      if (retry) return json(saleResult(command));
      if (problem === 'network') throw new TypeError('lost ACK');
      if (problem === 'timeout')
        throw new DOMException('timeout', 'TimeoutError');
      return problem === 'malformed'
        ? json({})
        : failure(Number(problem), 'INTERNAL_ERROR');
    });
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    await ctx.sales.prepare(initialCart());
    assert.equal(ctx.sales.snapshot().kind, 'UNCERTAIN');
    const descriptor = JSON.parse(ctx.values.get(PENDING_SALE_KEY)!);
    assert.deepEqual(Object.keys(descriptor).sort(), [
      'commandKind',
      'inventoryId',
      'operationId',
    ]);
    assert.equal(descriptor.commandKind, 'SALE_REGISTER');
    await ctx.sales.prepare(initialCart());
    assert.equal(bodies.length, 1);
    retry = true;
    await ctx.sales.retry();
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
    assert.equal(reads, 1);
    assert.equal(ctx.values.size, 0);
  });
test('retry CSRF failure preserves previously sent intent and never refreshes costs', async (t) => {
  let csrfCalls = 0,
    posts = 0,
    reads = 0;
  const ctx = salesFixture(async (input, options) => {
    if (String(input).endsWith('/csrf'))
      return ++csrfCalls === 1 ? csrf() : failure(429, 'RATE_LIMITED');
    if (options?.method === 'POST') {
      posts++;
      throw new TypeError('lost ACK');
    }
    reads++;
    return json(saleProduct);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.sales.prepare(initialCart());
  const previous = ctx.values.get(PENDING_SALE_KEY);
  await ctx.sales.retry();
  assert.equal(ctx.sales.snapshot().kind, 'UNCERTAIN');
  assert.equal(ctx.values.get(PENDING_SALE_KEY), previous);
  assert.equal(posts, 1);
  assert.equal(reads, 1);
});
test('storage failure prevents POST after refresh/CSRF and has no payload fallback', async (t) => {
  let posts = 0;
  const ctx = salesFixture(async (input, options) => {
    if (options?.method === 'POST') posts++;
    return success(input, options);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  ctx.storage.setItem = () => {
    throw new Error('storage unavailable');
  };
  await ctx.sales.prepare(initialCart());
  assert.equal(posts, 0);
  assert.equal(ctx.sales.snapshot().kind, 'ERROR');
  assert.equal(ctx.values.size, 0);
});
test('COST_SNAPSHOT_CONFLICT is terminal, refreshes cost and keeps chosen prices for the next explicit new key', async (t) => {
  const sent: RegisterSaleCommand[] = [];
  let cost = '2000000';
  const ctx = salesFixture(async (input, options) => {
    if (String(input).endsWith('/csrf')) return csrf();
    if (options?.method === 'POST') {
      const cmd = JSON.parse(String(options.body));
      sent.push(cmd);
      cost = '3000000';
      return sent.length === 1
        ? failure(409, 'COST_SNAPSHOT_CONFLICT')
        : json(saleResult(cmd));
    }
    return json({
      ...saleProduct,
      state: { ...saleProduct.state, unitCost: cost },
    });
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const cart = editPrice(initialCart(), productId, '1.765432'),
    before = JSON.stringify(cart);
  await ctx.sales.prepare(cart);
  assert.equal(ctx.values.size, 0);
  assert.equal(ctx.sales.snapshot().kind, 'ERROR');
  assert.match(ctx.sales.snapshot().message, /El costo del inventario cambió/);
  assert.equal(ctx.sales.snapshot().refreshed![0].state.unitCost, '3000000');
  await ctx.sales.retry();
  assert.equal(sent.length, 1);
  await ctx.sales.prepare(cart);
  assert.equal(sent.length, 2);
  assert.notEqual(sent[0].operationId, sent[1].operationId);
  assert.equal(sent[1].payload.items[0].unitSalePrice, '1765432');
  assert.equal(
    sent[1].preconditions.expectedCosts[0].unitCostSnapshot,
    '3000000',
  );
  assert.equal(JSON.stringify(cart), before);
});
for (const [status, code] of [
  [404, 'NOT_FOUND'],
  [422, 'DOMAIN_RULE'],
  [422, 'MONEY_OVERFLOW'],
] as const)
  test(`terminal ${code} keeps same-tab cart and clears pending with safe feedback`, async (t) => {
    let posts = 0;
    const ctx = salesFixture(async (input, options) => {
      if (String(input).endsWith('/csrf')) return csrf();
      if (options?.method === 'POST') {
        posts++;
        return failure(status, code);
      }
      return posts && status === 404 ? failure(404) : json(saleProduct);
    });
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    const cart = initialCart(),
      before = JSON.stringify(cart);
    await ctx.sales.prepare(cart);
    assert.equal(posts, 1);
    assert.equal(ctx.values.size, 0);
    assert.equal(ctx.sales.snapshot().kind, 'ERROR');
    assert.equal(JSON.stringify(cart), before);
    await ctx.sales.retry();
    assert.equal(posts, 1);
    if (status === 404)
      assert.deepEqual(ctx.sales.snapshot().unavailable, [productId]);
  });
for (const outcome of ['ACCEPTED', 'CONFLICT', 'REJECTED', '404'] as const)
  test(`reload ${outcome} uses the public ChangeSet and never reconstructs a cart or posts`, async (t) => {
    const cmd = prepareSale(initialCart(), [saleProduct]).command;
    const paths: string[] = [];
    const body =
      outcome === 'ACCEPTED'
        ? saleReceipt(cmd)
        : {
            operationId: cmd.operationId,
            status: outcome,
            error: {
              code: 'COST_SNAPSHOT_CONFLICT',
              message: 'Public',
              requestId: 'r',
            },
          };
    const ctx = salesFixture(
      async (input, options) => {
        paths.push(String(input));
        assert.equal(options?.method, 'GET');
        return outcome === '404' ? failure(404) : json(body);
      },
      JSON.stringify({
        operationId: cmd.operationId,
        inventoryId,
        commandKind: 'SALE_REGISTER',
      }),
    );
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    await settledSale(ctx.sales);
    assert.equal(paths.length, 1);
    assert.ok(paths[0].endsWith(`/operations/${cmd.operationId}`));
    assert.equal(
      ctx.sales.snapshot().kind,
      outcome === 'ACCEPTED'
        ? 'ACCEPTED'
        : outcome === '404'
          ? 'UNCERTAIN'
          : 'ERROR',
    );
    if (outcome === 'ACCEPTED') {
      assert.equal(ctx.sales.snapshot().saleId, cmd.payload.saleId);
      assert.match(
        ctx.sales.snapshot().message,
        /La venta anterior sí fue registrada/,
      );
      assert.ok(!('resultReferences' in body));
    }
    if (outcome === '404') {
      assert.equal(ctx.sales.snapshot().canRetry, false);
      await ctx.sales.retry();
      assert.equal(paths.length, 1);
      assert.equal(ctx.values.size, 1);
      ctx.sales.discard();
    }
    assert.equal(ctx.values.size, 0);
  });
test('accepted receipt in the same tab resolves unknown using the exact public Sale identity', async (t) => {
  let cmd: RegisterSaleCommand | undefined;
  const ctx = salesFixture(async (input, options) => {
    if (String(input).endsWith('/csrf')) return csrf();
    if (options?.method === 'POST') {
      cmd = JSON.parse(String(options.body));
      throw new TypeError('lost ACK');
    }
    if (String(input).includes('/operations/')) return json(saleReceipt(cmd!));
    return json(saleProduct);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.sales.prepare(initialCart());
  await ctx.sales.check();
  assert.equal(ctx.sales.snapshot().kind, 'ACCEPTED');
  assert.equal(ctx.values.size, 0);
  assert.equal(ctx.sales.snapshot().saleId, cmd!.payload.saleId);
});
test('foreign pending inventory is cleared without querying the operation', async (t) => {
  let calls = 0;
  const ctx = salesFixture(
    async () => {
      calls++;
      return json({});
    },
    JSON.stringify({
      operationId,
      inventoryId: operationId,
      commandKind: 'SALE_REGISTER',
    }),
  );
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await settledSale(ctx.sales);
  assert.equal(calls, 0);
  assert.equal(ctx.values.size, 0);
});
test('logout and A-to-B boundary clear Sale pending and never query the foreign receipt', async (t) => {
  const paths: string[] = [];
  const ctx = salesFixture(async (input, options) => {
    paths.push(String(input));
    if (options?.method === 'POST') throw new TypeError('lost');
    return success(input, options);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.sales.prepare(initialCart());
  assert.equal(ctx.values.size, 1);
  ctx.auth.session = async () => ({
    ...identity,
    userId: 'user-b',
    sessionId: 'session-b',
  });
  ctx.ownership.me = async () => ({
    ...me,
    user: { ...me.user, id: 'user-b' },
    business: { ...me.business!, id: operationId },
    inventory: { ...me.inventory!, id: operationId },
  });
  await ctx.controller.refresh();
  await ctx.sales.check();
  assert.equal(ctx.values.size, 0);
  assert.equal(ctx.sales.snapshot().kind, 'READY');
  assert.ok(paths.every((p) => !p.includes('/operations/')));
  await ctx.controller.logout();
  assert.equal(ctx.sales.snapshot().kind, 'READY');
});
test('late pre-submit read is fenced after expiry and never creates an operation', async (t) => {
  const response = deferred<Response>(),
    started = deferred<void>();
  let posts = 0;
  const ctx = salesFixture(async (_input, options) => {
    if (options?.method === 'POST') posts++;
    started.resolve();
    return response.promise;
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const pending = ctx.sales.prepare(initialCart());
  await started.promise;
  ctx.controller.expire();
  response.resolve(json(saleProduct));
  await pending;
  assert.equal(posts, 0);
  assert.equal(ctx.sales.snapshot().kind, 'READY');
  assert.equal(ctx.values.size, 0);
});
test('in-flight POST never optimistically changes Product cache and late acceptance is ignored after session expiry', async (t) => {
  const response = deferred<Response>(),
    started = deferred<void>();
  let cmd: RegisterSaleCommand | undefined;
  const ctx = salesFixture(async (input, options) => {
    if (options?.method === 'POST') {
      cmd = JSON.parse(String(options.body));
      started.resolve();
      return response.promise;
    }
    return success(input, options);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const key = productsKey(productScope(ctx.controller)!, 'detail', productId);
  ctx.queries.setQueryData(key, saleProduct);
  const pending = ctx.sales.prepare(initialCart());
  await started.promise;
  assert.equal(ctx.queries.getQueryData(key), saleProduct);
  assert.equal(ctx.sales.snapshot().kind, 'SENDING');
  ctx.controller.expire();
  response.resolve(json(saleResult(cmd!)));
  await pending;
  assert.equal(ctx.sales.snapshot().kind, 'READY');
  assert.equal(ctx.values.size, 0);
  assert.equal(ctx.queries.getQueryData(key), undefined);
});
test('success invalidates own Products and Sale detail while leaving unrelated cache untouched', async (t) => {
  const ctx = salesFixture(success);
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  const keys = [
    productsKey(scope, 'list', ''),
    productsKey(scope, 'list', 'a'),
    productsKey(scope, 'barcode', '0012345'),
    productsKey(scope, 'detail', productId),
  ];
  keys.forEach((key) => ctx.queries.setQueryData(key, saleProduct));
  ctx.queries.setQueryData(['other', 'products'], 'other');
  await ctx.sales.prepare(initialCart());
  for (const key of keys)
    assert.equal(ctx.queries.getQueryState(key)?.isInvalidated, true);
  assert.equal(ctx.queries.getQueryData(['other', 'products']), 'other');
  assert.deepEqual(salesKey(scope, 'detail', operationId).slice(0, 4), [
    'private',
    scope.generation,
    scope.businessId,
    scope.inventoryId,
  ]);
});
test('offline blocks preparation and minimal Sale storage rejects every commercial extra field without touching Product key', async (t) => {
  let calls = 0;
  const ctx = salesFixture(
    async () => {
      calls++;
      return json({});
    },
    undefined,
    () => false,
  );
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.sales.prepare(initialCart());
  assert.equal(calls, 0);
  ctx.storage.setItem(PENDING_PRODUCT_KEY, 'unrelated');
  for (const extra of [
    { saleId: productId },
    { cart: [] },
    { prices: [] },
    { token: 'x' },
    { payload: {} },
  ]) {
    ctx.storage.setItem(
      PENDING_SALE_KEY,
      JSON.stringify({
        operationId,
        inventoryId,
        commandKind: 'SALE_REGISTER',
        ...extra,
      }),
    );
    assert.equal(
      readDescriptor(ctx.storage, PENDING_SALE_KEY, ['SALE_REGISTER']),
      null,
    );
  }
  assert.equal(ctx.storage.getItem(PENDING_PRODUCT_KEY), 'unrelated');
});
