import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryObserver } from '@tanstack/react-query';
import {
  buildVoid,
  operation,
  type VoidCommand,
  type VoidKind,
} from '../src/voids/input.js';
import { commandScope } from '../src/commands/scope.js';
import { dashboardKey, historyKey } from '../src/reads/queries.js';
import { productsKey } from '../src/products/controller.js';
import { salesKey } from '../src/sales/controller.js';
import { purchasesKey } from '../src/purchases/controller.js';
import { identity, me, deferred } from './session-fixtures.js';
import { json, failure, inventoryId, operationId } from './product-fixtures.js';
import {
  voidReview,
  voidResult,
  voidReceipt,
  voidFixture,
  settledVoid,
  legacyOperationId,
} from './void-fixtures.js';
const kinds: VoidKind[] = ['SALE_VOID', 'PURCHASE_VOID'];
function scenario(kind: VoidKind) {
  let review = voidReview(kind, null, kind === 'SALE_VOID'),
    outcome = 'ok',
    posts = 0,
    reads = 0;
  const writes: VoidCommand[] = [];
  const f = voidFixture(kind, async (input, options) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/csrf')) return json({ token: 'csrf' });
    if (path.endsWith('/void')) {
      posts++;
      const command: VoidCommand = JSON.parse(String(options?.body));
      writes.push(command);
      if (outcome === 'network') throw new Error('ACK lost');
      if (outcome === 'malformed') return json({});
      if (outcome === '409') return failure(409, 'REVISION_CONFLICT');
      if (outcome === '422') return failure(422, 'VOID_NOT_ELIGIBLE');
      if (outcome === '404') return failure(404, 'NOT_FOUND');
      if (outcome === '503') return failure(503, 'TEMPORARILY_UNAVAILABLE');
      return json(voidResult(command, review));
    }
    if (path.includes('/operations/'))
      return outcome === 'receipt404'
        ? failure(404)
        : json(voidReceipt(writes[0]!, review));
    reads++;
    if (path.endsWith('/state'))
      return json(review.states.find((s) => path.includes(s.productId)));
    return json(review.detail);
  });
  return {
    ...f,
    writes,
    read: () => review,
    update: (next: typeof review) => {
      review = next;
    },
    outcome: (value: string) => {
      outcome = value;
    },
    posts: () => posts,
    reads: () => reads,
  };
}
for (const kind of kinds)
  test(`${kind} new confirmation refreshes detail/each State twice and cancellation sends nothing`, async (t) => {
    const f = scenario(kind);
    t.after(f.dispose);
    await f.controller.refresh();
    await f.voids.prepare(legacyOperationId);
    assert.equal(f.voids.snapshot().kind, 'WARNING');
    assert.equal(f.posts(), 0);
    f.voids.cancel();
    assert.equal(f.voids.snapshot().kind, 'READY');
    assert.equal(f.values.size, 0);
    const before = f.reads();
    await f.voids.prepare(legacyOperationId);
    await f.voids.confirm();
    assert.equal(f.voids.snapshot().kind, 'ACCEPTED');
    assert.equal(f.posts(), 1);
    assert.equal(f.reads() - before, 2 * (1 + f.read().states.length));
    const command = f.writes[0]!;
    assert.deepEqual(f.values.size, 0);
    assert.equal(command.commandKind, kind);
  });
for (const kind of kinds)
  for (const change of [
    'revision',
    'stock',
    'cost',
    'pointer',
    'eligibility',
    'status',
  ])
    test(`${kind} changed ${change} before confirmation never auto submits`, async (t) => {
      const f = scenario(kind);
      t.after(f.dispose);
      await f.controller.refresh();
      await f.voids.prepare(legacyOperationId);
      const r = structuredClone(f.read());
      if (change === 'revision')
        r.states[0]!.stateRevision = '9007199254740994';
      if (change === 'stock') r.states[0]!.stock++;
      if (change === 'cost') r.states[0]!.unitCost = '0';
      if (change === 'pointer') r.states[0]!.lastMovementId = operationId;
      if (change === 'eligibility')
        r.detail.voidEligibility = {
          eligible: false,
          reason: 'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT',
        };
      if (change === 'status') operation(r).status = 'VOIDED';
      f.update(r);
      await f.voids.confirm();
      assert.equal(f.posts(), 0);
      assert.equal(f.values.size, 0);
      assert.equal(
        f.voids.snapshot().kind,
        ['status', 'eligibility'].includes(change) ? 'ERROR' : 'WARNING',
      );
    });
for (const kind of kinds)
  for (const outcome of ['network', '503', 'malformed'])
    test(`${kind} ${outcome} keeps exact same body/IDs/preconditions/key and minimal descriptor on retry`, async (t) => {
      const f = scenario(kind);
      t.after(f.dispose);
      await f.controller.refresh();
      f.outcome(outcome);
      await f.voids.prepare(legacyOperationId);
      await f.voids.confirm();
      assert.equal(f.voids.snapshot().kind, 'UNCERTAIN');
      const saved = JSON.parse(f.values.get(f.key)!);
      assert.deepEqual(saved, {
        operationId: f.writes[0]!.operationId,
        inventoryId,
        commandKind: kind,
      });
      assert.deepEqual(Object.keys(saved).sort(), [
        'commandKind',
        'inventoryId',
        'operationId',
      ]);
      const before = f.reads();
      f.outcome('ok');
      await f.voids.retry();
      assert.equal(f.voids.snapshot().kind, 'ACCEPTED');
      assert.equal(f.posts(), 2);
      assert.deepEqual(f.writes[0], f.writes[1]);
      assert.equal(f.reads(), before);
      assert.equal(f.values.size, 0);
    });
for (const kind of kinds)
  for (const outcome of ['409', '422', '404'])
    test(`${kind} ${outcome} terminal clears pending/refetches only detail, no auto new command`, async (t) => {
      const f = scenario(kind);
      t.after(f.dispose);
      await f.controller.refresh();
      const scope = commandScope(f.controller)!;
      for (const key of [
        dashboardKey(scope),
        historyKey(scope),
        productsKey(scope),
      ])
        f.queries.setQueryData(key, { sentinel: true });
      const detail =
        kind === 'SALE_VOID'
          ? salesKey(scope, 'detail', legacyOperationId)
          : purchasesKey(scope, 'detail', legacyOperationId);
      f.queries.setQueryData(detail, {});
      f.outcome(outcome);
      await f.voids.prepare(legacyOperationId);
      await f.voids.confirm();
      assert.equal(f.values.size, 0);
      assert.equal(f.posts(), 1);
      assert.equal(f.queries.getQueryState(detail)!.isInvalidated, true);
      for (const key of [
        dashboardKey(scope),
        historyKey(scope),
        productsKey(scope),
      ])
        assert.equal(f.queries.getQueryState(key)!.isInvalidated, false);
      await f.voids.retry();
      await f.voids.confirm();
      assert.equal(f.posts(), 1);
      f.outcome('ok');
      await f.voids.prepare(legacyOperationId);
      assert.equal(f.posts(), 1);
      await f.voids.confirm();
      assert.equal(f.posts(), 2);
      assert.notEqual(f.writes[0]!.operationId, f.writes[1]!.operationId);
    });
for (const kind of kinds)
  for (const recovered of [false, true])
    test(`${kind} ${recovered ? 'receipt' : 'direct accepted'} refreshes own detail/Products/Home/History without optimistic data`, async (t) => {
      const review = voidReview(kind),
        command = buildVoid(review),
        gate = deferred<Response>(),
        started = deferred<void>();
      let posts = 0,
        version = 0,
        captured: VoidCommand | undefined;
      const f = voidFixture(
        kind,
        async (input, options) => {
          const path = String(input);
          if (path.endsWith('/csrf')) return json({ token: 'token' });
          if (path.includes('/operations/') || path.endsWith('/void')) {
            if (options?.method === 'POST') {
              posts++;
              captured = JSON.parse(String(options.body));
            }
            started.resolve();
            return gate.promise;
          }
          if (path.endsWith('/state')) return json(review.states[0]);
          return json(review.detail);
        },
        recovered
          ? { operationId: command.operationId, inventoryId, commandKind: kind }
          : undefined,
      );
      t.after(f.dispose);
      await f.controller.refresh();
      const scope = commandScope(f.controller)!;
      const keys = [
        dashboardKey(scope),
        historyKey(scope),
        productsKey(scope),
        kind === 'SALE_VOID'
          ? salesKey(scope, 'detail', legacyOperationId)
          : purchasesKey(scope, 'detail', legacyOperationId),
      ];
      const counts = keys.map(() => 0);
      const observers = keys.map(
        (queryKey, i) =>
          new QueryObserver(f.queries, {
            queryKey,
            queryFn: async () => {
              counts[i]++;
              return { version };
            },
          }),
      );
      const stops = observers.map((o) => o.subscribe(() => {}));
      t.after(() => stops.forEach((stop) => stop()));
      await Promise.all(observers.map((o) => o.refetch()));
      const before = [...counts];
      const other = { ...scope, inventoryId: operationId };
      f.queries.setQueryData(dashboardKey(other), { private: 'other' });
      let sent = Promise.resolve();
      if (!recovered) {
        await f.voids.prepare(legacyOperationId);
        sent = f.voids.confirm();
      }
      await started.promise;
      assert.deepEqual(counts, before);
      assert.deepEqual(observers[0]!.getCurrentResult().data, { version: 0 });
      version = 1;
      if (recovered) gate.resolve(json(voidReceipt(command, review)));
      else {
        assert.ok(captured);
        gate.resolve(json(voidResult(captured, review)));
      }
      await sent;
      await settledVoid(f.voids);
      {
        assert.equal(f.voids.snapshot().kind, 'ACCEPTED');
        assert.equal(posts, recovered ? 0 : 1);
        assert.deepEqual(
          counts,
          before.map((n) => n + 1),
        );
        assert.deepEqual(observers[0]!.getCurrentResult().data, { version: 1 });
        assert.equal(f.values.size, 0);
      }
      assert.equal(
        f.queries.getQueryState(dashboardKey(other))!.isInvalidated,
        false,
      );
    });
for (const kind of kinds)
  test(`${kind} reload404 retains descriptor, cannot invent retry body, explicit check/discard`, async (t) => {
    const r = voidReview(kind),
      cmd = buildVoid(r);
    let reads = 0,
      posts = 0;
    const f = voidFixture(
      kind,
      async (_input, options) => {
        reads++;
        if (options?.method === 'POST') posts++;
        return failure(404);
      },
      { operationId: cmd.operationId, inventoryId, commandKind: kind },
    );
    t.after(f.dispose);
    await f.controller.refresh();
    await settledVoid(f.voids);
    assert.equal(f.voids.snapshot().kind, 'UNCERTAIN');
    assert.equal(f.values.size, 1);
    assert.equal(f.voids.snapshot().canRetry, false);
    await f.voids.retry();
    assert.equal(posts, 0);
    await f.voids.check();
    assert.equal(reads, 2);
    f.voids.discard();
    assert.equal(f.values.size, 0);
  });
for (const kind of kinds)
  test(`${kind} same-session refresh preserves confirmation, real navigation clears it`, async (t) => {
    const f = scenario(kind);
    t.after(f.dispose);
    await f.controller.refresh();
    await f.voids.prepare(legacyOperationId);
    const before = structuredClone(f.voids.snapshot());
    await f.controller.refresh();
    assert.deepEqual(f.voids.snapshot(), before);
    f.voids.routeChanged(
      `/${kind === 'SALE_VOID' ? 'sales' : 'purchases'}/${legacyOperationId}`,
    );
    assert.equal(f.voids.snapshot().kind, 'WARNING');
    f.voids.routeChanged('/history');
    assert.equal(f.voids.snapshot().kind, 'READY');
    assert.equal(f.posts(), 0);
  });
for (const kind of kinds)
  for (const boundary of [
    'logout',
    'expired',
    'user',
    'business',
    'inventory',
    'business-disabled',
    'inventory-disabled',
  ])
    test(`${kind} ${boundary} fences late POST and clears descriptors/confirmation`, async (t) => {
      const r = voidReview(kind),
        gate = deferred<Response>(),
        started = deferred<void>();
      let captured: VoidCommand | undefined;
      const f = voidFixture(kind, async (input, options) => {
        if (String(input).endsWith('/csrf')) return json({ token: 'token' });
        if (String(input).endsWith('/void')) {
          captured = JSON.parse(String(options?.body));
          started.resolve();
          return gate.promise;
        }
        if (String(input).endsWith('/state')) return json(r.states[0]);
        return json(r.detail);
      });
      t.after(f.dispose);
      await f.controller.refresh();
      await f.voids.prepare(legacyOperationId);
      const sending = f.voids.confirm();
      await started.promise;
      if (boundary === 'logout') await f.controller.logout();
      else if (boundary === 'expired') f.controller.expire();
      else {
        f.auth.session = async () =>
          boundary === 'user'
            ? { ...identity, userId: 'user-b', sessionId: 'session-b' }
            : identity;
        f.ownership.me = async () => ({
          ...me,
          user: { ...me.user, id: boundary === 'user' ? 'user-b' : me.user.id },
          business: {
            ...me.business!,
            id: boundary.startsWith('business') ? operationId : me.business!.id,
            cloudAccessEnabled: !boundary.endsWith('disabled'),
          },
          inventory: {
            ...me.inventory!,
            id: boundary.startsWith('inventory')
              ? operationId
              : me.inventory!.id,
          },
        });
        await f.controller.refresh();
      }
      assert.ok(captured);
      gate.resolve(json(voidResult(captured, r)));
      await sending;
      assert.equal(f.values.size, 0);
      assert.equal(f.voids.snapshot().result, undefined);
      assert.equal(f.voids.snapshot().kind, 'READY');
    });
for (const kind of kinds)
  test(`${kind} offline disables new/confirm/retry and storage failure sends no POST`, async (t) => {
    const f = scenario(kind);
    t.after(f.dispose);
    await f.controller.refresh();
    f.setOnline(false);
    await f.voids.prepare(legacyOperationId);
    assert.equal(f.posts(), 0);
    f.setOnline(true);
    await f.voids.prepare(legacyOperationId);
    f.setOnline(false);
    await f.voids.confirm();
    assert.equal(f.posts(), 0);
    f.setOnline(true);
    f.storage.setItem = () => {
      throw new Error('Unavailable');
    };
    await f.voids.prepare(legacyOperationId);
    await f.voids.confirm();
    assert.equal(f.posts(), 0);
    assert.equal(f.values.size, 0);
  });
