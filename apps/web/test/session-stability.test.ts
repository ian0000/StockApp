import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClientError } from '../src/api/client.js';
import { fixture, identity, me, deferred } from './session-fixtures.js';

test('background renewal never withdraws the private tree, including while session and me are pending', async (t) => {
  const ctx = fixture();
  t.after(() => ctx.queries.clear());
  await ctx.controller.refresh();
  const generation = ctx.controller.snapshot().generation;
  const session = deferred<typeof identity>();
  const ownership = deferred<typeof me>();
  ctx.auth.session = () => session.promise;
  ctx.ownership.me = () => ownership.promise;
  const kinds: string[] = [];
  ctx.controller.subscribe(() => kinds.push(ctx.controller.snapshot().kind));
  const renewal = ctx.controller.refresh();
  assert.equal(ctx.controller.snapshot().kind, 'BUSINESS_ACTIVE_ENABLED');
  session.resolve({ ...identity, expiresAt: identity.expiresAt + 60_000 });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(ctx.controller.snapshot().kind, 'BUSINESS_ACTIVE_ENABLED');
  ownership.resolve(structuredClone(me));
  await renewal;
  assert.equal(ctx.controller.snapshot().generation, generation);
  assert.ok(kinds.every((kind) => kind === 'BUSINESS_ACTIVE_ENABLED'));
});

test('temporary session/me network failures retain the same private tree and recover on retry', async (t) => {
  for (const endpoint of ['session', 'me'] as const) {
    const ctx = fixture();
    t.after(() => ctx.queries.clear());
    await ctx.controller.refresh();
    const generation = ctx.controller.snapshot().generation;
    const fail = async () => {
      throw new ApiClientError('NETWORK', null);
    };
    if (endpoint === 'session') ctx.auth.session = fail;
    else ctx.ownership.me = fail;
    await ctx.controller.refresh();
    assert.equal(ctx.controller.snapshot().kind, 'BUSINESS_ACTIVE_ENABLED');
    assert.equal(ctx.controller.snapshot().generation, generation);
    ctx.auth.session = async () => identity;
    ctx.ownership.me = async () => structuredClone(me);
    await ctx.controller.refresh();
    assert.equal(ctx.controller.snapshot().kind, 'BUSINESS_ACTIVE_ENABLED');
    assert.equal(ctx.controller.snapshot().generation, generation);
  }
});

test('a failed background check cannot extend the last verified session beyond expiry', async (t) => {
  const ctx = fixture();
  t.after(() => ctx.queries.clear());
  await ctx.controller.refresh();
  ctx.auth.session = async () => {
    throw new ApiClientError('NETWORK', null);
  };
  t.mock.timers.enable({ apis: ['Date'], now: identity.expiresAt + 1 });
  await ctx.controller.refresh();
  assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
  assert.equal(ctx.queries.getQueryCache().getAll().length, 0);
});

test('a stalled revalidation is withdrawn at expiry on the next periodic check; late responses are fenced', async (t) => {
  const ctx = fixture();
  t.after(() => ctx.queries.clear());
  await ctx.controller.refresh();
  const waiting = deferred<typeof identity>();
  ctx.auth.session = () => waiting.promise;
  const pending = ctx.controller.refresh();
  t.mock.timers.enable({ apis: ['Date'], now: identity.expiresAt + 1 });
  await ctx.controller.refresh();
  assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
  waiting.resolve({ ...identity, expiresAt: identity.expiresAt + 60_000 });
  await pending;
  assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
});

test('changing inventory in the same session clears private drafts/cache before publishing the new scope', async (t) => {
  const ctx = fixture();
  t.after(() => ctx.queries.clear());
  await ctx.controller.refresh();
  const generation = ctx.controller.snapshot().generation;
  let boundaries = 0;
  ctx.controller.onBoundary(() => boundaries++);
  ctx.queries.setQueryData(['private', 'old-inventory'], 'OLD-DRAFT');
  ctx.ownership.me = async () => ({
    ...me,
    inventory: { ...me.inventory!, id: '019e3000-0000-7000-8000-000000000099' },
  });
  await ctx.controller.refresh();
  assert.equal(boundaries, 1);
  assert.ok(ctx.controller.snapshot().generation > generation);
  assert.equal(
    ctx.queries.getQueryData(['private', 'old-inventory']),
    undefined,
  );
});

test('a denied background me check withdraws access instead of retaining stale authorization', async (t) => {
  const ctx = fixture();
  t.after(() => ctx.queries.clear());
  await ctx.controller.refresh();
  ctx.ownership.me = async () => {
    throw new ApiClientError('HTTP', 403);
  };
  await ctx.controller.refresh();
  assert.equal(ctx.controller.snapshot().kind, 'ERROR');
});

test('a successful but delayed Me response cannot publish access after session expiry', async (t) => {
  const ctx = fixture();
  t.after(() => ctx.queries.clear());
  await ctx.controller.refresh();
  const waiting = deferred<typeof me>();
  ctx.ownership.me = () => waiting.promise;
  const pending = ctx.controller.refresh();
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.enable({ apis: ['Date'], now: identity.expiresAt + 1 });
  waiting.resolve(me);
  await pending;
  assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
});

for (const outcome of ['success', 'network'] as const) {
  test(`a commercial access denial fences an overlapping ${outcome} revalidation`, async (t) => {
    const ctx = fixture();
    t.after(() => ctx.queries.clear());
    await ctx.controller.refresh();
    const waiting = deferred<typeof me>();
    ctx.ownership.me = async () => {
      const result = await waiting.promise;
      if (outcome === 'network') throw new ApiClientError('NETWORK', null);
      return result;
    };
    const pending = ctx.controller.refresh();
    await new Promise<void>((resolve) => setImmediate(resolve));
    ctx.controller.handleBusinessError(
      new ApiClientError('HTTP', 403, {
        error: {
          code: 'CLOUD_ACCESS_DISABLED',
          message: 'Public',
          requestId: 'fixture-denial',
        },
      }),
    );
    assert.equal(ctx.controller.snapshot().kind, 'ERROR');
    waiting.resolve(me);
    await pending;
    assert.equal(ctx.controller.snapshot().kind, 'ERROR');
    assert.equal(ctx.queries.getQueryCache().getAll().length, 0);
  });
}
