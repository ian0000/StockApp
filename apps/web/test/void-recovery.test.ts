import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VoidCommand, VoidKind } from '../src/voids/input.js';
import { buildVoid, operation } from '../src/voids/input.js';
import {
  voidReview,
  voidReceipt,
  voidResult,
  voidFixture,
  settledVoid,
  legacyOperationId,
} from './void-fixtures.js';
import { identity, me, deferred } from './session-fixtures.js';
import { json, failure, inventoryId, operationId } from './product-fixtures.js';
import { readDescriptor } from '../src/commands/pending.js';
const kinds: VoidKind[] = ['SALE_VOID', 'PURCHASE_VOID'];
for (const kind of kinds)
  for (const status of ['CONFLICT', 'REJECTED'] as const)
    test(`${kind} reload ${status} clears minimal intent, no automatic POST or recreated identities`, async (t) => {
      const c = buildVoid(voidReview(kind));
      let calls = 0;
      const f = voidFixture(
        kind,
        async (_input, opts) => {
          calls++;
          assert.equal(opts?.method, 'GET');
          return json({
            operationId: c.operationId,
            status,
            error: {
              code:
                status === 'CONFLICT'
                  ? 'REVISION_CONFLICT'
                  : 'VOID_NOT_ELIGIBLE',
              message: 'Public',
              requestId: 'request',
            },
          });
        },
        { operationId: c.operationId, inventoryId, commandKind: kind },
      );
      t.after(f.dispose);
      await f.controller.refresh();
      await settledVoid(f.voids);
      assert.equal(f.values.size, 0);
      assert.equal(calls, 1);
      await f.voids.retry();
      await f.voids.confirm();
      assert.equal(calls, 1);
      assert.equal(
        f.voids.snapshot().kind,
        status === 'CONFLICT' ? 'CONFLICT' : 'ERROR',
      );
    });
for (const kind of kinds)
  for (const field of [
    'saleId',
    'purchaseId',
    'productIds',
    'movementIds',
    'stateRevision',
    'stock',
    'unitCost',
    'lastMovementId',
    'payload',
    'token',
    'csrf',
    'email',
  ])
    test(`${kind} descriptor rejects forbidden commercial/private field ${field}`, (t) => {
      const r = voidReview(kind),
        c = buildVoid(r),
        f = voidFixture(kind, async () => json({}));
      t.after(f.dispose);
      f.values.set(
        f.key,
        JSON.stringify({
          operationId: c.operationId,
          inventoryId,
          commandKind: kind,
          [field]: 'PRIVATE',
        }),
      );
      assert.equal(readDescriptor(f.storage, f.key, [kind]), null);
      assert.equal(f.values.size, 0);
    });
for (const kind of kinds)
  test(`${kind} late receipt cannot leak through account change or query another Inventory`, async (t) => {
    const r = voidReview(kind),
      c = buildVoid(r),
      gate = deferred<Response>(),
      started = deferred<void>();
    let calls = 0;
    const f = voidFixture(
      kind,
      async (input) => {
        calls++;
        assert.ok(String(input).includes(inventoryId));
        started.resolve();
        return gate.promise;
      },
      { operationId: c.operationId, inventoryId, commandKind: kind },
    );
    t.after(f.dispose);
    await f.controller.refresh();
    await started.promise;
    f.auth.session = async () => ({
      ...identity,
      userId: 'user-b',
      sessionId: 'session-b',
    });
    f.ownership.me = async () => ({
      ...me,
      user: { ...me.user, id: 'user-b' },
      inventory: { ...me.inventory!, id: operationId },
    });
    await f.controller.refresh();
    gate.resolve(json(voidReceipt(c, r)));
    await settledVoid(f.voids);
    assert.equal(calls, 1);
    assert.equal(f.values.size, 0);
    assert.equal(f.voids.snapshot().kind, 'READY');
    assert.equal(f.voids.snapshot().result, undefined);
  });
for (const kind of kinds)
  test(`${kind} receipt404 after uncertain send preserves same-tab retry body`, async (t) => {
    const r = voidReview(kind);
    let captured: VoidCommand | undefined,
      posts = 0;
    const f = voidFixture(kind, async (input, opts) => {
      if (String(input).endsWith('/csrf')) return json({ token: 'token' });
      if (String(input).includes('/operations/')) return failure(404);
      if (String(input).endsWith('/void')) {
        posts++;
        const c: VoidCommand = JSON.parse(String(opts?.body));
        if (!captured) {
          captured = c;
          return failure(503, 'TEMPORARILY_UNAVAILABLE');
        }
        assert.deepEqual(c, captured);
        return json(voidResult(c, r));
      }
      if (String(input).endsWith('/state')) return json(r.states[0]);
      return json(r.detail);
    });
    t.after(f.dispose);
    await f.controller.refresh();
    await f.voids.prepare(legacyOperationId);
    await f.voids.confirm();
    await f.voids.check();
    assert.equal(f.voids.snapshot().kind, 'UNCERTAIN');
    assert.equal(f.voids.snapshot().canRetry, true);
    assert.equal(f.values.size, 1);
    await f.voids.retry();
    assert.equal(posts, 2);
    assert.equal(f.voids.snapshot().kind, 'ACCEPTED');
  });
for (const kind of kinds)
  test(`${kind} navigation while prepare GET is held fences late confirmation`, async (t) => {
    const r = voidReview(kind),
      gate = deferred<Response>(),
      started = deferred<void>();
    let calls = 0;
    const f = voidFixture(kind, async () => {
      calls++;
      started.resolve();
      return gate.promise;
    });
    t.after(f.dispose);
    await f.controller.refresh();
    const preparing = f.voids.prepare(operation(r).id);
    await started.promise;
    f.voids.routeChanged('/history');
    gate.resolve(json(r.detail));
    await preparing;
    assert.equal(f.voids.snapshot().kind, 'READY');
    assert.equal(f.voids.snapshot().review, undefined);
    assert.equal(calls, 1);
  });
for (const kind of kinds)
  for (const defect of ['missing', 'malformed', 'foreign'])
    test(`${kind} incomplete State ${defect} prevents all writes/reversal IDs`, async (t) => {
      const r = voidReview(kind, null, kind === 'SALE_VOID');
      let posts = 0;
      const f = voidFixture(kind, async (input, opts) => {
        if (opts?.method === 'POST') posts++;
        if (String(input).endsWith('/state'))
          return defect === 'missing'
            ? failure(404)
            : defect === 'malformed'
              ? json({})
              : json({ ...r.states[0], inventoryId: operationId });
        return json(r.detail);
      });
      t.after(f.dispose);
      await f.controller.refresh();
      await f.voids.prepare(legacyOperationId);
      await f.voids.confirm();
      assert.equal(posts, 0);
      assert.equal(f.values.size, 0);
      assert.equal(f.voids.snapshot().kind, 'ERROR');
    });
