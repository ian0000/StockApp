import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AdjustStockCommand } from '@stock-app/contracts';
import {
  buildAdjustment,
  initialAdjustmentForm,
} from '../src/adjustments/input.js';
import { PENDING_ADJUSTMENT_KEY } from '../src/adjustments/controller.js';
import { productScope, productsKey } from '../src/products/controller.js';
import { readDescriptor } from '../src/commands/pending.js';
import {
  inventoryId,
  operationId,
  productId,
  json,
  failure,
} from './product-fixtures.js';
import { me, identity, deferred } from './session-fixtures.js';
import {
  adjustmentProduct,
  adjustmentForm,
  adjustmentResult,
  adjustmentReceipt,
  adjustmentsFixture,
  settledAdjustment,
} from './adjustment-fixtures.js';
test('late receipt after account boundary cannot restore old acceptance or query old Inventory again', async (t) => {
  const cmd = buildAdjustment(adjustmentForm(), adjustmentProduct),
    gate = deferred<Response>(),
    started = deferred<void>();
  let reads = 0;
  const ctx = adjustmentsFixture(
    async () => {
      reads++;
      started.resolve();
      return gate.promise;
    },
    JSON.stringify({
      operationId: cmd.operationId,
      inventoryId,
      commandKind: 'STOCK_ADJUST',
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
  gate.resolve(json(adjustmentReceipt(cmd)));
  await settledAdjustment(ctx.adjustments);
  assert.equal(reads, 1);
  assert.equal(ctx.values.size, 0);
  assert.equal(ctx.adjustments.snapshot().result, undefined);
  assert.equal(ctx.adjustments.snapshot().kind, 'READY');
});
test('storage failure before first POST sends no adjustment and does not invent recovery', async (t) => {
  let posts = 0;
  const ctx = adjustmentsFixture(async (input, options) => {
    if (options?.method === 'POST') posts++;
    return success(input, options);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  ctx.storage.setItem = () => {
    throw new Error('Storage unavailable');
  };
  await ctx.adjustments.prepare(adjustmentForm());
  await ctx.adjustments.confirm();
  assert.equal(posts, 0);
  assert.equal(ctx.values.size, 0);
  assert.equal(ctx.adjustments.snapshot().kind, 'ERROR');
});
test('offline retry preserves uncertain command without HTTP or changing evidence', async (t) => {
  let online = true,
    posts = 0;
  const ctx = adjustmentsFixture(
    async (input, options) => {
      if (options?.method === 'POST') {
        posts++;
        throw new TypeError('lost');
      }
      return success(input, options);
    },
    undefined,
    () => online,
  );
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await ctx.adjustments.prepare(adjustmentForm());
  await ctx.adjustments.confirm();
  const stored = ctx.storage.getItem(PENDING_ADJUSTMENT_KEY);
  online = false;
  await ctx.adjustments.retry();
  assert.equal(posts, 1);
  assert.equal(ctx.storage.getItem(PENDING_ADJUSTMENT_KEY), stored);
  assert.equal(ctx.adjustments.snapshot().kind, 'UNCERTAIN');
});
test('concurrent confirm clicks produce one command and one adjustment', async (t) => {
  const gate = deferred<Response>(),
    started = deferred<void>();
  let posts = 0,
    cmd: AdjustStockCommand | undefined;
  const ctx = adjustmentsFixture(async (input, options) => {
    if (options?.method === 'POST') {
      posts++;
      cmd = JSON.parse(String(options.body));
      started.resolve();
      return gate.promise;
    }
    return success(input, options);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await ctx.adjustments.prepare(adjustmentForm());
  const pending = ctx.adjustments.confirm();
  await started.promise;
  await ctx.adjustments.confirm();
  await ctx.adjustments.prepare(adjustmentForm());
  assert.equal(posts, 1);
  gate.resolve(json(adjustmentResult(cmd!)));
  await pending;
  assert.equal(ctx.adjustments.snapshot().kind, 'ACCEPTED');
});
async function success(input: RequestInfo | URL, options?: RequestInit) {
  if (String(input).endsWith('/csrf'))
    return json({ token: 'csrf-adjustment' });
  if (options?.method === 'POST')
    return json(adjustmentResult(JSON.parse(String(options.body))));
  return json(adjustmentProduct);
}
test('review is fresh and never allocates/sends intent; explicit confirm checks State before CSRF/POST', async (t) => {
  const paths: string[] = [];
  let command: AdjustStockCommand | undefined;
  const ctx = adjustmentsFixture(async (input, options) => {
    paths.push(String(input).split('/').at(-1)!);
    if (options?.method === 'POST') {
      command = JSON.parse(String(options.body));
      assert.equal(
        new Headers(options.headers).get('Idempotency-Key'),
        command!.operationId,
      );
      assert.equal(
        new Headers(options.headers).get('X-CSRF-Token'),
        'csrf-adjustment',
      );
      assert.equal(ctx.adjustments.snapshot().kind, 'SENDING');
      assert.deepEqual(
        JSON.parse(ctx.storage.getItem(PENDING_ADJUSTMENT_KEY)!),
        {
          operationId: command!.operationId,
          inventoryId,
          commandKind: 'STOCK_ADJUST',
        },
      );
      assert.equal(ctx.queries.getQueryData(key), adjustmentProduct);
      assert.equal(ctx.queries.getQueryState(key)?.isInvalidated, false);
    }
    return success(input, options);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!,
    key = productsKey(scope, 'detail', productId);
  ctx.queries.setQueryData(key, adjustmentProduct);
  ctx.adjustments.saveDraft(scope, adjustmentForm(), adjustmentProduct);
  await ctx.adjustments.prepare(adjustmentForm());
  assert.deepEqual(paths, [productId]);
  assert.equal(ctx.values.size, 0);
  assert.equal(ctx.adjustments.snapshot().kind, 'WARNING');
  await ctx.adjustments.confirm();
  assert.deepEqual(paths, [productId, productId, 'csrf', 'adjustments']);
  assert.equal(ctx.adjustments.snapshot().kind, 'ACCEPTED');
  assert.equal(ctx.values.size, 0);
  assert.equal(ctx.queries.getQueryData(key), adjustmentProduct);
  assert.equal(ctx.queries.getQueryState(key)?.isInvalidated, true);
  assert.equal(
    command!.preconditions.expectedStateRevision,
    '9007199254740993',
  );
});
for (const change of [
  'stock',
  'cost',
  'sign',
  'noop',
  'unknown-cost',
  'movement',
  'revision',
] as const)
  test(`changed ${change} between review and confirm requires new review and never auto writes`, async (t) => {
    let reads = 0,
      writes = 0;
    const fresh = structuredClone(adjustmentProduct);
    if (change === 'stock') fresh.state.stock = 8;
    if (change === 'cost') fresh.state.unitCost = '12000000';
    if (change === 'sign') fresh.state.stock = 14;
    if (change === 'noop') fresh.state.stock = 12;
    if (change === 'unknown-cost') {
      fresh.state.stock = 0;
      fresh.state.unitCost = null;
    }
    if (change === 'movement') fresh.state.lastMovementId = operationId;
    if (change === 'revision') fresh.state.stateRevision = '9007199254740994';
    const ctx = adjustmentsFixture(async (input, options) => {
      if (options?.method === 'POST') writes++;
      if (String(input).endsWith(productId))
        return json(++reads === 1 ? adjustmentProduct : fresh);
      return success(input, options);
    });
    t.after(ctx.dispose);
    await ctx.controller.refresh();
    await ctx.adjustments.prepare(adjustmentForm());
    await ctx.adjustments.confirm();
    assert.equal(writes, 0);
    assert.equal(ctx.values.size, 0);
    assert.equal(
      ctx.adjustments.snapshot().refreshed?.state.stock,
      fresh.state.stock,
    );
    assert.equal(
      ctx.adjustments.savedDraft(productScope(ctx.controller)!).form
        .actualStock,
      '12',
    );
    if (change === 'noop' || change === 'unknown-cost')
      assert.equal(ctx.adjustments.snapshot().kind, 'ERROR');
    else {
      assert.equal(ctx.adjustments.snapshot().kind, 'WARNING');
      await ctx.adjustments.confirm();
      assert.equal(writes, 1);
    }
  });
test('fresh positive sign flip rejects negative-only reason and preserves physical count/custom text', async (t) => {
  let reads = 0,
    writes = 0;
  const ctx = adjustmentsFixture(async (input, options) => {
    if (options?.method === 'POST') writes++;
    if (String(input).endsWith(productId))
      return json({
        ...adjustmentProduct,
        state: { ...adjustmentProduct.state, stock: ++reads === 1 ? 10 : 6 },
      });
    return success(input, options);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  const form = {
    ...adjustmentForm(),
    actualStock: '8',
    reason: 'DAMAGED' as const,
    customUnitCost: '4.123456',
  };
  await ctx.adjustments.prepare(form);
  await ctx.adjustments.confirm();
  assert.equal(writes, 0);
  assert.equal(ctx.adjustments.snapshot().field, 'reason');
  assert.deepEqual(
    ctx.adjustments.savedDraft(productScope(ctx.controller)!).form,
    form,
  );
});
test('editing review removes confirmation before a new fresh intent', async (t) => {
  const ctx = adjustmentsFixture(success);
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  await ctx.adjustments.prepare(adjustmentForm());
  ctx.adjustments.saveDraft(
    scope,
    { ...adjustmentForm(), actualStock: '13' },
    adjustmentProduct,
  );
  assert.equal(ctx.adjustments.snapshot().review, undefined);
  await ctx.adjustments.confirm();
  assert.equal(ctx.adjustments.snapshot().kind, 'READY');
});
for (const form of [
  initialAdjustmentForm(),
  { ...adjustmentForm(), actualStock: '-1' },
  { ...adjustmentForm(), actualStock: '1.5' },
  { ...adjustmentForm(), actualStock: '9007199254740992' },
])
  test('invalid Product/count never fetches or writes', async (t) => {
    let calls = 0;
    const ctx = adjustmentsFixture(async () => {
      calls++;
      return json({});
    });
    t.after(ctx.dispose);
    await ctx.controller.refresh();
    await ctx.adjustments.prepare(form);
    assert.equal(calls, 0);
    assert.equal(ctx.adjustments.snapshot().kind, 'ERROR');
  });
test('fresh no-op does not request CSRF, descriptor or POST', async (t) => {
  let calls = 0;
  const ctx = adjustmentsFixture(async () => {
    calls++;
    return json(adjustmentProduct);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await ctx.adjustments.prepare({ ...adjustmentForm(), actualStock: '10' });
  assert.equal(calls, 1);
  assert.equal(ctx.values.size, 0);
  assert.match(ctx.adjustments.snapshot().message, /coincide/);
  await ctx.adjustments.confirm();
  assert.equal(calls, 1);
});
for (const outcome of ['network', 'timeout', '500', '503', 'malformed'])
  test(`${outcome} retries exact IDs/body/key without fresh State`, async (t) => {
    const bodies: string[] = [],
      keys: string[] = [],
      paths: string[] = [];
    const ctx = adjustmentsFixture(async (input, options) => {
      paths.push(String(input));
      if (options?.method === 'POST') {
        bodies.push(String(options.body));
        keys.push(new Headers(options.headers).get('Idempotency-Key')!);
        if (bodies.length === 1) {
          if (outcome === 'network') throw new TypeError('lost');
          if (outcome === 'timeout')
            throw new DOMException('timeout', 'TimeoutError');
          if (outcome === 'malformed') return json({});
          return failure(Number(outcome), 'INTERNAL_ERROR');
        }
      }
      return success(input, options);
    });
    t.after(ctx.dispose);
    await ctx.controller.refresh();
    await ctx.adjustments.prepare(adjustmentForm());
    await ctx.adjustments.confirm();
    assert.equal(ctx.adjustments.snapshot().kind, 'UNCERTAIN');
    assert.equal(ctx.values.size, 1);
    await ctx.adjustments.prepare(adjustmentForm());
    await ctx.adjustments.retry();
    assert.equal(ctx.adjustments.snapshot().kind, 'ACCEPTED');
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
    assert.equal(keys[0], keys[1]);
    assert.equal(paths.filter((p) => p.endsWith(productId)).length, 2);
    assert.equal(ctx.values.size, 0);
  });
test('CSRF failure before retry keeps prior uncertain intent and descriptor', async (t) => {
  let csrf = 0,
    writes = 0;
  const ctx = adjustmentsFixture(async (input, options) => {
    if (String(input).endsWith('/csrf') && ++csrf === 2)
      throw new TypeError('csrf');
    if (options?.method === 'POST') {
      writes++;
      throw new TypeError('lost');
    }
    return success(input, options);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await ctx.adjustments.prepare(adjustmentForm());
  await ctx.adjustments.confirm();
  const stored = ctx.storage.getItem(PENDING_ADJUSTMENT_KEY);
  await ctx.adjustments.retry();
  assert.equal(writes, 1);
  assert.equal(ctx.adjustments.snapshot().kind, 'UNCERTAIN');
  assert.equal(ctx.storage.getItem(PENDING_ADJUSTMENT_KEY), stored);
});
for (const [status, code] of [
  [409, 'REVISION_CONFLICT'],
  [404, 'NOT_FOUND'],
  [422, 'DOMAIN_RULE'],
  [429, 'RATE_LIMITED'],
] as const)
  test(`terminal ${status} clears intent and cannot same-key retry`, async (t) => {
    let writes = 0;
    const ctx = adjustmentsFixture(async (input, options) => {
      if (options?.method === 'POST') {
        writes++;
        return failure(status, code);
      }
      if (status === 404 && writes && String(input).endsWith(productId))
        return failure(404, 'NOT_FOUND');
      return success(input, options);
    });
    t.after(ctx.dispose);
    await ctx.controller.refresh();
    const form = adjustmentForm();
    await ctx.adjustments.prepare(form);
    await ctx.adjustments.confirm();
    assert.equal(ctx.values.size, 0);
    assert.equal(ctx.adjustments.snapshot().kind, 'ERROR');
    await ctx.adjustments.retry();
    assert.equal(writes, 1);
    assert.equal(
      ctx.adjustments.savedDraft(productScope(ctx.controller)!).form
        .actualStock,
      '12',
    );
  });
test('409 shows old/new stock and new difference, new explicit command has fresh IDs', async (t) => {
  const commands: AdjustStockCommand[] = [];
  let reads = 0;
  const ctx = adjustmentsFixture(async (input, options) => {
    if (options?.method === 'POST') {
      commands.push(JSON.parse(String(options.body)));
      return commands.length === 1
        ? failure(409, 'REVISION_CONFLICT')
        : success(input, options);
    }
    if (String(input).endsWith(productId))
      return json({
        ...adjustmentProduct,
        state: {
          ...adjustmentProduct.state,
          stock: ++reads > 2 ? 8 : 10,
          stateRevision: reads > 2 ? '9007199254740994' : '9007199254740993',
        },
      });
    return success(input, options);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await ctx.adjustments.prepare(adjustmentForm());
  await ctx.adjustments.confirm();
  assert.equal(commands.length, 1);
  assert.equal(ctx.adjustments.snapshot().observedStock, 10);
  assert.equal(ctx.adjustments.snapshot().refreshed?.state.stock, 8);
  assert.match(ctx.adjustments.snapshot().message, /cambió/);
  await ctx.adjustments.prepare(adjustmentForm());
  assert.equal(ctx.adjustments.snapshot().review?.preview.difference, 4);
  assert.equal(commands.length, 1);
  await ctx.adjustments.confirm();
  assert.equal(commands.length, 2);
  assert.equal(commands[1].payload.actualStock, 12);
  assert.equal(commands[1].preconditions.expectedState.stock, 8);
  assert.notEqual(commands[0].operationId, commands[1].operationId);
  assert.notEqual(
    commands[0].payload.stockAdjustmentId,
    commands[1].payload.stockAdjustmentId,
  );
  assert.notEqual(
    commands[0].payload.movementId,
    commands[1].payload.movementId,
  );
});
for (const outcome of [
  'ACCEPTED',
  'CONFLICT',
  'REJECTED',
  '404',
  'malformed',
] as const)
  test(`reload ${outcome} uses only public scoped receipt before another adjustment`, async (t) => {
    const cmd = buildAdjustment(adjustmentForm(), adjustmentProduct),
      paths: string[] = [];
    const ctx = adjustmentsFixture(
      async (input) => {
        paths.push(String(input));
        return outcome === 'ACCEPTED'
          ? json(adjustmentReceipt(cmd))
          : outcome === '404'
            ? failure(404, 'NOT_FOUND')
            : outcome === 'malformed'
              ? json({
                  resultReferences: {
                    stockAdjustmentId: cmd.payload.stockAdjustmentId,
                  },
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
        commandKind: 'STOCK_ADJUST',
      }),
    );
    t.after(ctx.dispose);
    await ctx.controller.refresh();
    await settledAdjustment(ctx.adjustments);
    assert.equal(paths.length, 1);
    assert.ok(paths[0].endsWith('/operations/' + cmd.operationId));
    if (outcome === 'ACCEPTED') {
      assert.equal(
        ctx.adjustments.snapshot().result?.adjustment.id,
        cmd.payload.stockAdjustmentId,
      );
      assert.match(
        ctx.adjustments.snapshot().message,
        /anterior sí fue registrado/,
      );
      assert.equal(
        ctx.adjustments.savedDraft(productScope(ctx.controller)!).form
          .productId,
        null,
      );
    }
    if (outcome === '404' || outcome === 'malformed') {
      assert.equal(ctx.values.size, 1);
      await ctx.adjustments.prepare(adjustmentForm());
      await ctx.adjustments.retry();
      assert.equal(paths.length, 1);
      ctx.adjustments.discard();
    }
    assert.equal(ctx.values.size, 0);
  });
for (const boundary of ['logout', 'expired', 'user', 'inventory', 'business'])
  test(`${boundary} clears pending/draft and fences late accepted response`, async (t) => {
    const gate = deferred<Response>(),
      started = deferred<void>();
    let cmd: AdjustStockCommand | undefined;
    const ctx = adjustmentsFixture(async (input, options) => {
      if (options?.method === 'POST') {
        cmd = JSON.parse(String(options.body));
        started.resolve();
        return gate.promise;
      }
      return success(input, options);
    });
    t.after(ctx.dispose);
    await ctx.controller.refresh();
    const scope = productScope(ctx.controller)!;
    ctx.adjustments.saveDraft(scope, adjustmentForm(), adjustmentProduct);
    await ctx.adjustments.prepare(adjustmentForm());
    const pending = ctx.adjustments.confirm();
    await started.promise;
    if (boundary === 'logout') await ctx.controller.logout();
    else if (boundary === 'expired') ctx.controller.expire();
    else {
      if (boundary === 'user')
        ctx.auth.session = async () => ({
          ...identity,
          userId: 'user-b',
          sessionId: 'session-b',
        });
      ctx.ownership.me = async () => ({
        ...me,
        user: { ...me.user, id: boundary === 'user' ? 'user-b' : me.user.id },
        inventory: {
          ...me.inventory!,
          id: boundary === 'inventory' ? operationId : inventoryId,
        },
        business: {
          ...me.business!,
          id: boundary === 'business' ? operationId : me.business!.id,
        },
      });
      await ctx.controller.refresh();
    }
    gate.resolve(json(adjustmentResult(cmd!)));
    await pending;
    assert.equal(ctx.values.size, 0);
    assert.equal(ctx.adjustments.snapshot().kind, 'READY');
    assert.equal(ctx.adjustments.savedDraft(scope).form.productId, null);
  });
test('same-session revalidation preserves draft, review and accepted confirmation', async (t) => {
  const ctx = adjustmentsFixture(success);
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  ctx.adjustments.saveDraft(scope, adjustmentForm(), adjustmentProduct);
  await ctx.adjustments.prepare(adjustmentForm());
  const review = ctx.adjustments.snapshot().review;
  await ctx.controller.refresh();
  assert.deepEqual(ctx.adjustments.savedDraft(scope).form, adjustmentForm());
  assert.equal(ctx.adjustments.snapshot().review, review);
  await ctx.adjustments.confirm();
  const result = ctx.adjustments.snapshot().result;
  await ctx.controller.refresh();
  assert.equal(ctx.adjustments.snapshot().result, result);
});
test('real navigation clears unsent review/draft, pending navigation keeps retry intent', async (t) => {
  const ctx = adjustmentsFixture(async (input, options) => {
    if (options?.method === 'POST') throw new TypeError('lost');
    return success(input, options);
  });
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  await ctx.adjustments.prepare(adjustmentForm());
  ctx.adjustments.routeChanged('/products');
  assert.equal(ctx.adjustments.savedDraft(scope).form.productId, null);
  assert.equal(ctx.adjustments.snapshot().review, undefined);
  await ctx.adjustments.prepare(adjustmentForm());
  await ctx.adjustments.confirm();
  ctx.adjustments.routeChanged('/products');
  assert.equal(ctx.values.size, 1);
  assert.equal(ctx.adjustments.snapshot().kind, 'UNCERTAIN');
});
test('foreign Inventory descriptor is cleared without reading another receipt', async (t) => {
  let calls = 0;
  const ctx = adjustmentsFixture(
    async () => {
      calls++;
      return json({});
    },
    JSON.stringify({
      operationId,
      inventoryId: operationId,
      commandKind: 'STOCK_ADJUST',
    }),
  );
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  assert.equal(calls, 0);
  assert.equal(ctx.values.size, 0);
});
test('offline cannot review/write; rejected descriptor extras never persist commerce', async (t) => {
  let calls = 0;
  const ctx = adjustmentsFixture(
    async () => {
      calls++;
      return json({});
    },
    undefined,
    () => false,
  );
  t.after(ctx.dispose);
  await ctx.controller.refresh();
  await ctx.adjustments.prepare(adjustmentForm());
  assert.equal(calls, 0);
  for (const extra of [
    { actualStock: 12 },
    { stockBefore: 10 },
    { difference: 2 },
    { unitCost: '0' },
    { customUnitCost: '0' },
    { reason: 'OTHER' },
    { costMode: 'CUSTOM_COST' },
    { payload: {} },
    { productId },
    { stockAdjustmentId: operationId },
    { movementId: operationId },
    { name: 'Product' },
    { token: 'secret' },
  ]) {
    ctx.storage.setItem(
      PENDING_ADJUSTMENT_KEY,
      JSON.stringify({
        operationId,
        inventoryId,
        commandKind: 'STOCK_ADJUST',
        ...extra,
      }),
    );
    assert.equal(
      readDescriptor(ctx.storage, PENDING_ADJUSTMENT_KEY, ['STOCK_ADJUST']),
      null,
    );
  }
  assert.equal(ctx.values.size, 0);
});
