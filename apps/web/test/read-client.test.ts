import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryObserver, InfiniteQueryObserver } from '@tanstack/react-query';
import { createApiClient, ApiClientError } from '../src/api/client.js';
import { createReadsClient, uniqueHistory } from '../src/reads/client.js';
import {
  dashboardKey,
  historyKey,
  dashboardOptions,
  historyOptions,
} from '../src/reads/queries.js';
import { commandScope } from '../src/commands/scope.js';
import { fixture, identity, me, deferred } from './session-fixtures.js';
import { dashboard, historyEntries, emptyDashboard } from './read-fixtures.js';
import { inventoryId, json, failure } from './product-fixtures.js';
const reads = (fetcher: typeof fetch) =>
  createReadsClient(
    createApiClient({ baseUrl: 'https://api.example.test', fetcher }),
  );
const signal = () => new AbortController().signal;

test('Dashboard GET uses real own endpoint and shared DTO with no CSRF, key, body or mutation', async () => {
  const client = reads(async (input, options) => {
    assert.equal(
      String(input),
      `https://api.example.test/v1/inventories/${inventoryId.toUpperCase()}/dashboard`,
    );
    assert.equal(options!.method, 'GET');
    assert.equal(options!.credentials, 'include');
    assert.equal(options!.cache, 'no-store');
    assert.equal(options!.body, undefined);
    assert.equal(new Headers(options!.headers).has('X-CSRF-Token'), false);
    assert.equal(new Headers(options!.headers).has('Idempotency-Key'), false);
    return json(dashboard);
  });
  assert.deepEqual(
    await client.dashboard(inventoryId.toUpperCase(), signal()),
    dashboard,
  );
});
for (const [name, value] of Object.entries({
  empty: {},
  profitMissing: { ...dashboard, sales: { totalAmount: '0', unitsSold: 0 } },
  unknownAsZeroNumber: {
    ...dashboard,
    sales: { ...dashboard.sales, estimatedProfit: 0 },
  },
  decimalMoney: {
    ...dashboard,
    sales: { ...dashboard.sales, totalAmount: '1.23' },
  },
  overflowMoney: {
    ...dashboard,
    sales: { ...dashboard.sales, totalAmount: '9007199254740992' },
  },
  extraField: { ...dashboard, token: 'private' },
  wrongInventory: {
    ...dashboard,
    lowStock: [
      {
        ...dashboard.lowStock[0]!,
        state: {
          ...dashboard.lowStock[0]!.state,
          inventoryId: historyEntries[0]!.id,
        },
      },
    ],
  },
  wrongStateProduct: {
    ...dashboard,
    lowStock: [
      {
        ...dashboard.lowStock[0]!,
        state: {
          ...dashboard.lowStock[0]!.state,
          productId: historyEntries[0]!.id,
        },
      },
    ],
  },
  archivedLow: {
    ...dashboard,
    lowStock: [
      {
        ...dashboard.lowStock[0]!,
        product: { ...dashboard.lowStock[0]!.product, isArchived: true },
      },
    ],
  },
  nonLow: {
    ...dashboard,
    lowStock: [{ ...dashboard.lowStock[0]!, isLowStock: false }],
  },
  lowAboveTwo: {
    ...dashboard,
    lowStock: [...dashboard.lowStock, dashboard.lowStock[0]],
  },
  recentAboveFive: {
    ...dashboard,
    recent: [...historyEntries, ...historyEntries],
  },
  invalidRange: { ...dashboard, toExclusive: dashboard.fromInclusive },
}))
  test(`malformed Dashboard ${name} fails safely`, async () => {
    await assert.rejects(
      () => reads(async () => json(value)).dashboard(inventoryId, signal()),
      (error) =>
        error instanceof ApiClientError && error.kind === 'INVALID_JSON',
    );
  });
for (const profit of [null, '0', '-1234567', '9007199254740991'])
  test(`Dashboard preserves exact nullable/signed profit ${profit}`, async () => {
    const value = {
      ...dashboard,
      sales: { ...dashboard.sales, estimatedProfit: profit },
    };
    assert.deepEqual(
      await reads(async () => json(value)).dashboard(inventoryId, signal()),
      value,
    );
  });
test('History initial limit50 and next opaque cursor are exact and server order unchanged', async () => {
  const cursor = 'opaque+/=&?cursor',
    pages = [
      { items: historyEntries, nextCursor: cursor },
      { items: [historyEntries[2]!], nextCursor: null },
    ];
  let calls = 0;
  const client = reads(async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, `/v1/inventories/${inventoryId}/history`);
    assert.equal(url.searchParams.get('limit'), '50');
    assert.equal(url.searchParams.get('cursor'), calls === 0 ? null : cursor);
    assert.equal(options!.method, 'GET');
    return json(pages[calls++]);
  });
  const first = await client.history(inventoryId, null, signal()),
    second = await client.history(inventoryId, first.nextCursor, signal());
  assert.deepEqual(first.items, historyEntries);
  assert.deepEqual(uniqueHistory([first, second]), historyEntries);
});
for (const type of [
  'REVERSAL',
  'INITIAL_STOCK',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
])
  test(`History shared schema rejects technical discriminator ${type}`, async () => {
    await assert.rejects(
      () =>
        reads(async () =>
          json({ items: [{ ...historyEntries[2], type }], nextCursor: null }),
        ).history(inventoryId, null, signal()),
      ApiClientError,
    );
  });
for (const value of [
  { items: [], nextCursor: 1 },
  { items: [{ ...historyEntries[2], status: 'CONFIRMED' }], nextCursor: null },
  {
    items: Array.from({ length: 51 }, () => historyEntries[0]),
    nextCursor: null,
  },
])
  test('History rejects malformed cursor/extra Adjustment status/oversized page', async () => {
    await assert.rejects(
      () => reads(async () => json(value)).history(inventoryId, null, signal()),
      ApiClientError,
    );
  });
test('same UUID across different operation types remains two rows; duplicate same identity is suppressed', () => {
  const entries = [
    historyEntries[0]!,
    { ...historyEntries[1]!, id: historyEntries[0]!.id },
    historyEntries[0]!,
  ];
  assert.deepEqual(
    uniqueHistory([{ items: entries, nextCursor: null }]),
    entries.slice(0, 2),
  );
});
for (const status of [400, 401, 403, 404, 429, 500])
  test(`private reads preserve safe HTTP ${status} failure`, async () => {
    await assert.rejects(
      () =>
        reads(async () =>
          failure(status, status === 401 ? 'UNAUTHENTICATED' : 'NOT_FOUND'),
        ).history(inventoryId, null, signal()),
      (error) =>
        error instanceof ApiClientError &&
        error.status === status &&
        !error.message.includes('SQL'),
    );
  });
test('network failure can be explicitly refetched through a real QueryObserver, without automatic retries', async (t) => {
  const f = fixture();
  t.after(() => {
    f.controller.dispose();
    f.queries.clear();
  });
  await f.controller.refresh();
  let calls = 0;
  const client = reads(async () => {
    if (++calls === 1) throw new TypeError('private stack');
    return json(emptyDashboard);
  });
  const options = dashboardOptions(client, commandScope(f.controller)!);
  await assert.rejects(() => f.queries.fetchQuery(options), ApiClientError);
  assert.equal(calls, 1);
  const observer = new QueryObserver(f.queries, options),
    stop = observer.subscribe(() => {});
  t.after(stop);
  await observer.refetch();
  assert.equal(calls, 2);
  assert.deepEqual(observer.getCurrentResult().data, emptyDashboard);
});
test('History InfiniteQuery appends real pages, consumes the opaque cursor and stops on null', async (t) => {
  const f = fixture();
  t.after(() => {
    f.controller.dispose();
    f.queries.clear();
  });
  await f.controller.refresh();
  let calls = 0;
  const client = reads(async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('cursor'), calls === 0 ? null : 'next');
    return json({
      items: [historyEntries[calls++]!],
      nextCursor: calls === 1 ? 'next' : null,
    });
  });
  const observer = new InfiniteQueryObserver(
      f.queries,
      historyOptions(client, commandScope(f.controller)!),
    ),
    stop = observer.subscribe(() => {});
  t.after(stop);
  await observer.refetch();
  await observer.fetchNextPage();
  assert.equal(calls, 2);
  assert.equal(observer.getCurrentResult().hasNextPage, false);
  assert.deepEqual(
    uniqueHistory(observer.getCurrentResult().data!.pages),
    historyEntries.slice(0, 2),
  );
});
test('private read keys include generation, Business and Inventory independently', () => {
  const scope = {
    generation: 1,
    businessId: 'b',
    inventoryId: 'i',
    currency: 'EUR',
  };
  for (const key of [dashboardKey, historyKey]) {
    assert.deepEqual(key(scope).slice(0, 4), ['private', 1, 'b', 'i']);
    for (const next of [
      { ...scope, generation: 2 },
      { ...scope, businessId: 'other' },
      { ...scope, inventoryId: 'other' },
    ])
      assert.notDeepEqual(key(scope), key(next));
  }
});
for (const kind of ['dashboard', 'history'] as const)
  test(`late ${kind} response after account switch cannot repopulate a new scope`, async (t) => {
    let currentIdentity = identity,
      currentMe = structuredClone(me);
    const f = fixture(
      { session: async () => currentIdentity },
      { me: async () => currentMe },
    );
    t.after(() => {
      f.controller.dispose();
      f.queries.clear();
    });
    await f.controller.refresh();
    const gate = deferred<Response>(),
      started = deferred<void>();
    const client = reads(async () => {
        started.resolve();
        return gate.promise;
      }),
      old = commandScope(f.controller)!;
    const request =
      kind === 'dashboard'
        ? f.queries.fetchQuery(dashboardOptions(client, old))
        : f.queries.fetchInfiniteQuery(historyOptions(client, old));
    const settled = request.catch(() => undefined);
    await started.promise;
    currentIdentity = { ...identity, userId: 'user-b', sessionId: 'session-b' };
    currentMe = {
      ...me,
      user: { ...me.user, id: 'user-b' },
      business: { ...me.business!, id: historyEntries[0]!.id },
      inventory: { ...me.inventory!, id: historyEntries[1]!.id },
    };
    await f.controller.refresh();
    gate.resolve(
      json(
        kind === 'dashboard'
          ? dashboard
          : { items: historyEntries, nextCursor: null },
      ),
    );
    await settled;
    assert.equal(
      f.queries.getQueryData(
        kind === 'dashboard' ? dashboardKey(old) : historyKey(old),
      ),
      undefined,
    );
    assert.equal(
      f.queries.getQueryData(
        kind === 'dashboard'
          ? dashboardKey(commandScope(f.controller)!)
          : historyKey(commandScope(f.controller)!),
      ),
      undefined,
    );
  });
test('same-session refresh preserves cache and exact reporting range from server', async (t) => {
  const f = fixture();
  t.after(() => {
    f.controller.dispose();
    f.queries.clear();
  });
  await f.controller.refresh();
  const scope = commandScope(f.controller)!;
  f.queries.setQueryData(dashboardKey(scope), dashboard);
  await f.controller.refresh();
  assert.deepEqual(commandScope(f.controller), scope);
  assert.deepEqual(f.queries.getQueryData(dashboardKey(scope)), dashboard);
});
