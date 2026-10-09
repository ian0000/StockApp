import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  RegisterPurchaseCommand,
  UpdateProductCommand,
} from '@stock-app/contracts';
import { buildPurchase, initialPurchaseForm } from '../src/purchases/input.js';
import {
  PENDING_PURCHASE_KEY,
  purchasesKey,
} from '../src/purchases/controller.js';
import { productsKey, productScope } from '../src/products/controller.js';
import { readDescriptor } from '../src/commands/pending.js';
import { PENDING_PRODUCT_KEY } from '../src/products/pending.js';
import {
  inventoryId,
  operationId,
  productId,
  json,
  failure,
} from './product-fixtures.js';
import { me, identity, deferred } from './session-fixtures.js';
import {
  purchaseProduct,
  purchaseForm,
  purchaseCsrf,
  purchaseResult,
  purchaseReceipt,
  purchasesFixture,
  settledPurchase,
} from './purchase-fixtures.js';
async function success(input: RequestInfo | URL, options?: RequestInit) {
  if (String(input).endsWith('/csrf')) return purchaseCsrf();
  if (options?.method === 'POST')
    return json(purchaseResult(JSON.parse(String(options.body))));
  return json(purchaseProduct);
}
test('pre-submit fresh Product read before CSRF/POST carries exact State and no optimistic cache', async (t) => {
  const paths: string[] = [];
  let command: RegisterPurchaseCommand | undefined;
  const ctx = purchasesFixture(async (input, options) => {
    paths.push(String(input));
    if (options?.method === 'POST') {
      command = JSON.parse(String(options.body));
      assert.equal(
        new Headers(options.headers).get('Idempotency-Key'),
        command!.operationId,
      );
      assert.equal(
        new Headers(options.headers).get('X-CSRF-Token'),
        'csrf-purchase',
      );
      assert.equal(ctx.purchases.snapshot().kind, 'SENDING');
      assert.equal(
        ctx.queries.getQueryData(
          productsKey(productScope(ctx.controller)!, 'detail', productId),
        ),
        purchaseProduct,
      );
      assert.equal(
        ctx.queries.getQueryState(
          productsKey(productScope(ctx.controller)!, 'detail', productId),
        )?.isInvalidated,
        false,
      );
    }
    return success(input, options);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  const key = productsKey(scope, 'detail', productId);
  ctx.queries.setQueryData(key, purchaseProduct);
  await ctx.purchases.prepare(purchaseForm());
  assert.equal(ctx.purchases.snapshot().kind, 'ACCEPTED');
  assert.deepEqual(
    paths.map((p) => p.split('/').at(-1)),
    [productId, 'csrf', 'purchases'],
  );
  assert.equal(
    command!.preconditions.expectedStateRevision,
    '9007199254740993',
  );
  assert.equal(ctx.queries.getQueryData(key), purchaseProduct);
  assert.equal(ctx.queries.getQueryState(key)?.isInvalidated, true);
  assert.equal(ctx.values.size, 0);
  assert.ok(ctx.purchases.snapshot().confirmation?.result.priceAnalysis);
  assert.deepEqual(purchasesKey(scope, 'detail', operationId).slice(0, 4), [
    'private',
    scope.generation,
    scope.businessId,
    scope.inventoryId,
  ]);
});
for (const form of [
  initialPurchaseForm(),
  { ...purchaseForm(), quantity: '0' },
  { ...purchaseForm(), unitCost: '' },
  { ...purchaseForm(), unitCost: '9007199254.740991', quantity: '2' },
])
  test('invalid Purchase form never reaches refresh or POST', async (t) => {
    let calls = 0;
    const ctx = purchasesFixture(async () => {
      calls++;
      return json({});
    });
    t.after(ctx.dispose);
    await ctx.controller.refresh();
    await ctx.purchases.prepare(form);
    assert.equal(calls, 0);
    assert.equal(ctx.purchases.snapshot().kind, 'ERROR');
  });
test('missing pre-submit Product preserves form, sends nothing and marks unavailable', async (t) => {
  const form = purchaseForm();
  let calls = 0;
  const ctx = purchasesFixture(async () => {
    calls++;
    return failure(404, 'NOT_FOUND');
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await ctx.purchases.prepare(form);
  assert.equal(calls, 1);
  assert.equal(ctx.purchases.snapshot().refreshed, null);
  assert.equal(form.unitCost, '12');
  assert.equal(ctx.values.size, 0);
});
for (const error of ['network', 'timeout', '500', '503', 'malformed'])
  test(`${error} preserves exact Purchase body/key and retry does not refresh State`, async (t) => {
    let writes = 0;
    const bodies: string[] = [],
      keys: string[] = [],
      paths: string[] = [];
    const ctx = purchasesFixture(async (input, options) => {
      paths.push(String(input));
      if (options?.method === 'POST') {
        writes++;
        bodies.push(String(options.body));
        keys.push(new Headers(options.headers).get('Idempotency-Key')!);
        if (writes === 1) {
          if (error === 'network') throw new TypeError('lost');
          if (error === 'timeout')
            throw new DOMException('timeout', 'TimeoutError');
          if (error === 'malformed') return json({});
          return failure(Number(error), 'INTERNAL_ERROR');
        }
      }
      return success(input, options);
    });
    t.after(ctx.dispose);
    await ctx.controller.refresh();
    await ctx.purchases.prepare(purchaseForm());
    assert.equal(ctx.purchases.snapshot().kind, 'UNCERTAIN');
    assert.deepEqual(
      Object.keys(JSON.parse(ctx.values.get(PENDING_PURCHASE_KEY)!)).sort(),
      ['commandKind', 'inventoryId', 'operationId'],
    );
    await ctx.purchases.prepare(purchaseForm());
    assert.equal(writes, 1);
    await ctx.purchases.retry();
    assert.equal(ctx.purchases.snapshot().kind, 'ACCEPTED');
    assert.equal(bodies[0], bodies[1]);
    assert.equal(keys[0], keys[1]);
    assert.equal(paths.filter((p) => p.endsWith('/' + productId)).length, 1);
    assert.equal(ctx.values.size, 0);
  });
test('retry CSRF failure preserves prior Purchase uncertainty', async (t) => {
  let tokens = 0,
    writes = 0;
  const ctx = purchasesFixture(async (input, options) => {
    if (String(input).endsWith('/csrf')) {
      tokens++;
      if (tokens === 2) throw new TypeError('csrf unavailable');
      return purchaseCsrf();
    }
    if (options?.method === 'POST') {
      writes++;
      throw new TypeError('lost');
    }
    return json(purchaseProduct);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await ctx.purchases.prepare(purchaseForm());
  const descriptor = ctx.values.get(PENDING_PURCHASE_KEY);
  await ctx.purchases.retry();
  assert.equal(ctx.purchases.snapshot().kind, 'UNCERTAIN');
  assert.equal(writes, 1);
  assert.equal(ctx.values.get(PENDING_PURCHASE_KEY), descriptor);
});
test('stale State conflict is terminal, refreshes without resubmit and next explicit intent captures new IDs/user cost', async (t) => {
  let current = purchaseProduct;
  const commands: RegisterPurchaseCommand[] = [];
  let reads = 0;
  const ctx = purchasesFixture(async (input, options) => {
    if (String(input).endsWith('/csrf')) return purchaseCsrf();
    if (options?.method === 'POST') {
      const cmd: RegisterPurchaseCommand = JSON.parse(String(options.body));
      commands.push(cmd);
      if (commands.length === 1) {
        current = {
          ...purchaseProduct,
          state: {
            ...purchaseProduct.state,
            stock: 19,
            stateRevision: '9007199254740994',
          },
        };
        return failure(409, 'REVISION_CONFLICT');
      }
      return json(purchaseResult(cmd));
    }
    reads++;
    return json(current);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  const form = purchaseForm();
  await ctx.purchases.prepare(form);
  assert.equal(ctx.purchases.snapshot().kind, 'ERROR');
  assert.deepEqual(ctx.purchases.snapshot().refreshed, current);
  assert.equal(reads, 2);
  assert.equal(ctx.values.size, 0);
  await ctx.purchases.retry();
  assert.equal(commands.length, 1);
  await ctx.purchases.prepare(form);
  assert.equal(commands.length, 2);
  assert.notEqual(commands[0].operationId, commands[1].operationId);
  assert.notEqual(
    commands[0].payload.purchaseId,
    commands[1].payload.purchaseId,
  );
  assert.notEqual(
    commands[0].payload.movementId,
    commands[1].payload.movementId,
  );
  assert.equal(commands[1].preconditions.expectedState.stock, 19);
  assert.equal(commands[1].payload.unitCost, '12000000');
  assert.equal(form.unitCost, '12');
});
for (const [status, code] of [
  [404, 'NOT_FOUND'],
  [422, 'DOMAIN_RULE'],
  [422, 'MONEY_OVERFLOW'],
  [429, 'RATE_LIMITED'],
] as const)
  test(`terminal ${code} keeps form and clears pending safely`, async (t) => {
    let writes = 0;
    const ctx = purchasesFixture(async (input, options) => {
      if (options?.method === 'POST') {
        writes++;
        return failure(status, code);
      }
      if (status === 404 && writes && !String(input).endsWith('/csrf'))
        return failure(404, 'NOT_FOUND');
      return success(input, options);
    });
    t.after(ctx.dispose);
    await ctx.controller.refresh();
    const form = purchaseForm();
    await ctx.purchases.prepare(form);
    assert.equal(ctx.purchases.snapshot().kind, 'ERROR');
    assert.equal(ctx.values.size, 0);
    assert.equal(form.unitCost, '12');
    await ctx.purchases.retry();
    assert.equal(writes, 1);
    assert.doesNotMatch(
      ctx.purchases.snapshot().message,
      /SQL|stack|fingerprint/,
    );
  });
for (const outcome of [
  'ACCEPTED',
  'CONFLICT',
  'REJECTED',
  '404',
  'malformed',
] as const)
  test(`reload ${outcome} resolves identity without rebuilding editor or Purchase`, async (t) => {
    const cmd = buildPurchase(purchaseForm(), purchaseProduct);
    const paths: string[] = [];
    const ctx = purchasesFixture(
      async (input) => {
        paths.push(String(input));
        return outcome === 'ACCEPTED'
          ? json(purchaseReceipt(cmd))
          : outcome === '404'
            ? failure(404, 'NOT_FOUND')
            : outcome === 'malformed'
              ? json({
                  status: 'ACCEPTED',
                  resultReferences: { purchaseId: cmd.payload.purchaseId },
                })
              : json({
                  operationId: cmd.operationId,
                  status: outcome,
                  error: {
                    code:
                      outcome === 'CONFLICT'
                        ? 'REVISION_CONFLICT'
                        : 'DOMAIN_RULE',
                    message: 'Public',
                    requestId: 'r',
                  },
                });
      },
      JSON.stringify({
        operationId: cmd.operationId,
        inventoryId,
        commandKind: 'PURCHASE_REGISTER',
      }),
    );
    t.after(ctx.dispose);
    await ctx.controller.refresh();
    await settledPurchase(ctx.purchases);
    assert.equal(paths.length, 1);
    assert.ok(paths[0].endsWith('/operations/' + cmd.operationId));
    assert.equal(ctx.purchases.snapshot().confirmation, undefined);
    if (outcome === 'ACCEPTED') {
      assert.equal(ctx.purchases.snapshot().purchaseId, cmd.payload.purchaseId);
      assert.match(
        ctx.purchases.snapshot().message,
        /La compra anterior sí fue registrada/,
      );
    }
    if (outcome === '404' || outcome === 'malformed') {
      assert.equal(ctx.values.size, 1);
      await ctx.purchases.prepare(purchaseForm());
      await ctx.purchases.retry();
      assert.equal(paths.length, 1);
      ctx.purchases.discard();
    }
    assert.equal(ctx.values.size, 0);
  });
test('foreign Inventory descriptor is cleared without querying its receipt', async (t) => {
  let calls = 0;
  const ctx = purchasesFixture(
    async () => {
      calls++;
      return json({});
    },
    JSON.stringify({
      operationId,
      inventoryId: operationId,
      commandKind: 'PURCHASE_REGISTER',
    }),
  );
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  assert.equal(calls, 0);
  assert.equal(ctx.values.size, 0);
});
test('logout/account switch clears Purchase descriptor and ignores late POST result', async (t) => {
  const gate = deferred<Response>(),
    started = deferred<void>();
  let cmd: RegisterPurchaseCommand | undefined;
  const ctx = purchasesFixture(async (input, options) => {
    if (options?.method === 'POST') {
      cmd = JSON.parse(String(options.body));
      started.resolve();
      return gate.promise;
    }
    return success(input, options);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  const pending = ctx.purchases.prepare(purchaseForm());
  await started.promise;
  ctx.controller.expire();
  ctx.auth.session = async () => ({
    ...identity,
    userId: 'user-b',
    sessionId: 'session-b',
  });
  ctx.ownership.me = async () => ({
    ...me,
    user: { ...me.user, id: 'user-b' },
    inventory: { ...me.inventory!, id: operationId },
  });
  await ctx.controller.refresh();
  gate.resolve(json(purchaseResult(cmd!)));
  await pending;
  assert.equal(ctx.purchases.snapshot().kind, 'READY');
  assert.equal(ctx.purchases.snapshot().confirmation, undefined);
  assert.equal(ctx.values.size, 0);
});
test('account switch fences a late Purchase receipt and never queries the prior account receipt again', async (t) => {
  const gate = deferred<Response>(),
    started = deferred<void>();
  const cmd = buildPurchase(purchaseForm(), purchaseProduct);
  let calls = 0;
  const ctx = purchasesFixture(
    async () => {
      calls++;
      started.resolve();
      return gate.promise;
    },
    JSON.stringify({
      operationId: cmd.operationId,
      inventoryId,
      commandKind: 'PURCHASE_REGISTER',
    }),
  );
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await started.promise;
  ctx.controller.expire();
  ctx.auth.session = async () => ({
    ...identity,
    userId: 'user-b',
    sessionId: 'session-b',
  });
  ctx.ownership.me = async () => ({
    ...me,
    user: { ...me.user, id: 'user-b' },
    inventory: { ...me.inventory!, id: operationId },
  });
  await ctx.controller.refresh();
  gate.resolve(json(purchaseReceipt(cmd)));
  await settledPurchase(ctx.purchases);
  assert.equal(calls, 1);
  assert.equal(ctx.purchases.snapshot().kind, 'READY');
  assert.equal(ctx.purchases.snapshot().purchaseId, undefined);
  assert.equal(ctx.purchases.snapshot().confirmation, undefined);
  assert.equal(ctx.values.size, 0);
});

test('offline, unavailable storage and commercial descriptor extras never create a Purchase', async (t) => {
  let calls = 0;
  const ctx = purchasesFixture(
    async () => {
      calls++;
      return json({});
    },
    undefined,
    () => false,
  );
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await ctx.purchases.prepare(purchaseForm());
  assert.equal(calls, 0);
  ctx.storage.setItem(PENDING_PRODUCT_KEY, 'original');
  for (const extra of [
    { purchaseId: productId },
    { productId },
    { quantity: 1 },
    { unitCost: '1' },
    { priceAnalysis: {} },
    { margin: '30' },
    { payload: {} },
  ]) {
    ctx.storage.setItem(
      PENDING_PURCHASE_KEY,
      JSON.stringify({
        operationId,
        inventoryId,
        commandKind: 'PURCHASE_REGISTER',
        ...extra,
      }),
    );
    assert.equal(
      readDescriptor(ctx.storage, PENDING_PURCHASE_KEY, ['PURCHASE_REGISTER']),
      null,
    );
  }
  assert.equal(ctx.storage.getItem(PENDING_PRODUCT_KEY), 'original');
});
function priceSuccess(command: UpdateProductCommand) {
  return json({
    product: {
      ...purchaseProduct.product,
      name: command.payload.name,
      variant: command.payload.variant,
      barcode: command.payload.barcode,
      minimumStock: command.payload.minimumStock,
      regularSalePrice: command.payload.regularSalePrice,
      metadataRevision: '1',
    },
    committedRevision: '2',
    serverRecordedAt: Date.now(),
  });
}
for (const outcome of ['success', 'network', 'conflict', '404', '422'] as const)
  test(`separate price ${outcome}: purchase stays confirmed and never posts another Purchase`, async (t) => {
    let buys = 0,
      updates = 0;
    const bodies: string[] = [];
    const paths: string[] = [];
    const ctx = purchasesFixture(async (input, options) => {
      paths.push(String(input));
      if (options?.method === 'PATCH') {
        updates++;
        bodies.push(String(options.body));
        if (outcome === 'network' && updates === 1)
          throw new TypeError('lost price ACK');
        if (outcome === 'conflict') return failure(409, 'REVISION_CONFLICT');
        if (outcome === '404') return failure(404, 'NOT_FOUND');
        if (outcome === '422') return failure(422, 'DOMAIN_RULE');
        return priceSuccess(JSON.parse(String(options.body)));
      }
      if (options?.method === 'POST') buys++;
      return success(input, options);
    });
    t.after(ctx.dispose);
    await ctx.controller.refresh();
    await ctx.purchases.prepare(purchaseForm());
    const accepted = ctx.purchases.snapshot().confirmation!.result;
    await ctx.purchases.applyPrice();
    assert.equal(buys, 1);
    assert.equal(updates, 1);
    assert.equal(ctx.purchases.snapshot().kind, 'ACCEPTED');
    assert.equal(accepted.purchase.status, 'CONFIRMED');
    assert.equal(ctx.purchases.snapshot().confirmation!.result, accepted);
    const cmd: UpdateProductCommand = JSON.parse(bodies[0]);
    assert.equal(cmd.commandKind, 'PRODUCT_UPDATE');
    assert.equal(
      cmd.preconditions.expectedMetadataRevision,
      accepted.product.metadataRevision,
    );
    assert.equal(
      paths.filter((p) => p.endsWith('/' + productId)).length,
      outcome === 'conflict' ? 3 : 2,
    );
    if (outcome === 'network') {
      assert.equal(
        ctx.purchases.snapshot().confirmation!.decision,
        'uncertain',
      );
      ctx.purchases.leaveConfirmation();
      assert.ok(ctx.purchases.snapshot().confirmation);
      await ctx.products.retry();
      assert.equal(buys, 1);
      assert.equal(bodies[1], bodies[0]);
      assert.equal(ctx.purchases.snapshot().confirmation!.decision, 'applied');
    } else
      assert.equal(
        ctx.purchases.snapshot().confirmation!.decision,
        outcome === 'success'
          ? 'applied'
          : outcome === 'conflict'
            ? 'conflict'
            : 'error',
      );
    await ctx.purchases.prepare(purchaseForm());
    assert.equal(buys, 1);
  });
test('keep price and leaving confirmation have zero writes and discard transient margin', async (t) => {
  let writes = 0;
  const ctx = purchasesFixture(async (input, options) => {
    if (options?.method === 'POST' || options?.method === 'PATCH') writes++;
    return success(input, options);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await ctx.purchases.prepare(purchaseForm());
  ctx.purchases.editMargin('40,123456');
  ctx.purchases.keepPrice();
  assert.equal(writes, 1);
  assert.equal(ctx.purchases.snapshot().confirmation!.decision, 'kept');
  ctx.purchases.leaveConfirmation();
  assert.equal(ctx.purchases.snapshot().kind, 'READY');
  assert.equal(ctx.purchases.snapshot().confirmation, undefined);
});
test('same-session auth refresh preserves form and margin; actual navigation or boundary clears them', async (t) => {
  const ctx = purchasesFixture(success);
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!,
    form = { ...purchaseForm(), unitCost: '12,123456' };
  ctx.purchases.saveDraft(scope, form, purchaseProduct);
  await ctx.controller.refresh();
  assert.deepEqual(
    ctx.purchases.savedDraft(productScope(ctx.controller)!).form,
    form,
  );
  await ctx.purchases.prepare(purchaseForm());
  ctx.purchases.editMargin('33,123456');
  await ctx.controller.refresh();
  assert.equal(ctx.purchases.snapshot().confirmation!.margin.text, '33,123456');
  ctx.purchases.routeChanged('/purchases/new');
  assert.equal(ctx.purchases.snapshot().kind, 'ACCEPTED');
  ctx.purchases.routeChanged('/products');
  assert.equal(ctx.purchases.snapshot().kind, 'READY');
  assert.equal(ctx.purchases.snapshot().confirmation, undefined);
  assert.deepEqual(ctx.purchases.savedDraft(scope).form, initialPurchaseForm());
  ctx.purchases.saveDraft(scope, form, purchaseProduct);
  ctx.controller.expire();
  assert.deepEqual(ctx.purchases.savedDraft(scope).form, initialPurchaseForm());
});
test('unrelated pending Product prevents price update without blocking accepted Purchase', async (t) => {
  let buys = 0,
    updates = 0;
  const ctx = purchasesFixture(async (input, options) => {
    if (options?.method === 'PATCH') {
      updates++;
      throw new TypeError('lost Product');
    }
    if (options?.method === 'POST') buys++;
    return success(input, options);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await ctx.products.update(
    (await import('../src/products/edit.js')).initialEditDraft(
      purchaseProduct.product,
    ),
  );
  await ctx.purchases.prepare(purchaseForm());
  await ctx.purchases.applyPrice();
  assert.equal(buys, 1);
  assert.equal(updates, 1);
  assert.match(ctx.purchases.snapshot().confirmation!.priceMessage, /Resuelve/);
});
