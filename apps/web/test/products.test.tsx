import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  InfiniteQueryObserver,
  QueryObserver,
  QueryClientProvider,
} from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { CreateProductCommand } from '@stock-app/contracts';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import { createApiClient, ApiClientError } from '../src/api/client.js';
import {
  createProductsClient,
  uniqueProducts,
} from '../src/products/client.js';
import {
  ProductsController,
  productScope,
  productsKey,
} from '../src/products/controller.js';
import { ProductsContext } from '../src/products/context.js';
import { productListOptions } from '../src/products/queries.js';
import { initialProductForm } from '../src/products/input.js';
import {
  NewProductPage,
  ProductsPage,
  BarcodeMatch,
  EmptyProducts,
} from '../src/routes/products.js';
import { PENDING_PRODUCT_KEY, readPending } from '../src/products/pending.js';
import { fixture, identity, me, deferred } from './session-fixtures.js';
import { SessionProvider } from '../src/auth/context.js';
import {
  productsFixture,
  product,
  productId,
  operationId,
  inventoryId,
  json,
  failure,
  strictResult,
  receipt,
  descriptor,
  memoryStorage,
  settled,
} from './product-fixtures.js';

const form = {
  ...initialProductForm(),
  name: 'Agua',
  barcode: '0012345',
  regularSalePrice: '1.123456',
};
const signal = () => new AbortController().signal;
function contextClient(fetcher: typeof fetch) {
  return createProductsClient(
    createApiClient({ baseUrl: 'https://api.example.test', fetcher }),
  );
}
function render(
  ctx: ReturnType<typeof productsFixture>,
  Component: typeof ProductsPage | typeof NewProductPage,
  state?: unknown,
) {
  const router = createMemoryRouter([{ path: '/', Component }], {
    initialEntries: [{ pathname: '/', state }],
  });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={ctx.queries}>
      <SessionProvider controller={ctx.controller}>
        <ProductsContext.Provider value={ctx.products}>
          <RouterProvider router={router} />
        </ProductsContext.Provider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  router.dispose();
  return html;
}
test('ProductPage renders active exact fields, negative stock, price, low stock and encoded detail link', async (t) => {
  const ctx = productsFixture(async () =>
    json({ items: [product], nextCursor: 'opaque' }),
  );
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  await ctx.queries.fetchInfiniteQuery(
    productListOptions(ctx.client, scope, ''),
  );
  const html = render(ctx, ProductsPage);
  for (const text of [
    'Agua',
    '1 L',
    '0012345',
    'Stock: -2',
    '1.12',
    'Stock bajo',
    'Cargar más',
    `/products/${productId}`,
    'Código de barras',
  ])
    assert.ok(html.includes(text), text);
  assert.equal(
    ctx.queries.getQueryData<{ pages: { items: (typeof product)[] }[] }>(
      productsKey(scope, 'list', ''),
    )!.pages[0]!.items[0]!.state.unitCost,
    null,
  );
  assert.ok(!html.includes('undefined'));
});
test('known zero price renders separately from unavailable cost without modifying transport', async (t) => {
  const zero = structuredClone(product);
  zero.product.regularSalePrice = '0';
  zero.state.unitCost = '0';
  const ctx = productsFixture(async () =>
    json({ items: [zero], nextCursor: null }),
  );
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.queries.fetchInfiniteQuery(
    productListOptions(ctx.client, productScope(ctx.controller)!, ''),
  );
  assert.ok(render(ctx, ProductsPage).includes('0.00'));
  assert.equal(zero.product.regularSalePrice, '0');
});
test('empty inventory/no results and loading are explicit accessible states', async (t) => {
  const ctx = productsFixture();
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  assert.ok(render(ctx, ProductsPage).includes('Cargando productos'));
  await ctx.queries.fetchInfiniteQuery(
    productListOptions(ctx.client, productScope(ctx.controller)!, ''),
  );
  assert.ok(render(ctx, ProductsPage).includes('Aún no tienes productos'));
});
test('real Query retry recovers from server error without hidden retries', async (t) => {
  let calls = 0;
  const ctx = productsFixture(async () =>
    ++calls === 1
      ? failure(503, 'TEMPORARILY_UNAVAILABLE')
      : json({ items: [product], nextCursor: null }),
  );
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const observer = new InfiniteQueryObserver(
    ctx.queries,
    productListOptions(ctx.client, productScope(ctx.controller)!, ''),
  );
  await observer.refetch();
  assert.equal(observer.getCurrentResult().isError, true);
  assert.equal(calls, 1);
  assert.ok(render(ctx, ProductsPage).includes('Reintentar consulta'));
  await observer.refetch();
  assert.equal(observer.getCurrentResult().data?.pages[0]?.items.length, 1);
  assert.equal(calls, 2);
});
test('server search, opaque keyset append/dedup and search scope reset use real QueryClient', async (t) => {
  const calls: URL[] = [];
  const second = structuredClone(product);
  second.product.id = '019e3000-0000-7000-8000-000000000009';
  second.state.productId = second.product.id;
  const ctx = productsFixture(async (url) => {
    const parsed = new URL(String(url));
    calls.push(parsed);
    return json(
      parsed.searchParams.has('cursor')
        ? { items: [product, second], nextCursor: null }
        : { items: [product], nextCursor: 'opaque+/=?' },
    );
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  const observer = new InfiniteQueryObserver(
    ctx.queries,
    productListOptions(ctx.client, scope, 'Agua 1 L'),
  );
  await observer.refetch();
  await observer.fetchNextPage();
  assert.equal(calls[0]!.searchParams.get('search'), 'Agua 1 L');
  assert.equal(calls[1]!.searchParams.get('cursor'), 'opaque+/=?');
  assert.deepEqual(
    uniqueProducts(observer.getCurrentResult().data!.pages).map(
      (item) => item.product.id,
    ),
    [productId, second.product.id],
  );
  observer.setOptions(productListOptions(ctx.client, scope, '0012345'));
  await observer.refetch();
  assert.equal(calls[2]!.searchParams.get('search'), '0012345');
  assert.equal(calls[2]!.searchParams.has('cursor'), false);
  assert.equal(observer.getCurrentResult().data?.pages.length, 1);
  assert.equal(
    calls.some((url) => url.searchParams.has('offset')),
    false,
  );
});
test('query keys include generation/business/inventory and isolate barcode and pages', () => {
  const scope = {
    generation: 1,
    businessId: 'A',
    inventoryId,
    currency: 'EUR',
  };
  assert.notDeepEqual(
    productsKey(scope, 'list', 'x'),
    productsKey({ ...scope, generation: 2 }, 'list', 'x'),
  );
  assert.notDeepEqual(
    productsKey(scope, 'list', 'x'),
    productsKey({ ...scope, businessId: 'B', inventoryId: 'B' }, 'list', 'x'),
  );
  assert.notDeepEqual(
    productsKey(scope, 'list', 'x'),
    productsKey(scope, 'barcode', 'x'),
  );
});
for (const bad of [
  { items: [], nextCursor: 1 },
  {
    items: [{ ...product, product: { ...product.product, isArchived: true } }],
    nextCursor: null,
  },
  {
    items: [
      { ...product, product: { ...product.product, inventoryId: operationId } },
    ],
    nextCursor: null,
  },
])
  test('malformed/archived/foreign page is rejected by read boundary', async () =>
    assert.rejects(
      () =>
        contextClient(async () => json(bad)).page(
          inventoryId,
          '',
          null,
          signal(),
        ),
      ApiClientError,
    ));
test('barcode exact endpoint preserves leading zeros/internal content and ignores general search', async () => {
  let called = '';
  const client = contextClient(async (url) => {
    called = String(url);
    return json(product);
  });
  const item = await client.barcode(inventoryId, ' 0012345 ', signal());
  assert.deepEqual(item, product);
  const url = new URL(called);
  assert.equal(
    url.pathname,
    `/v1/inventories/${inventoryId}/products/by-barcode`,
  );
  assert.equal(url.searchParams.get('code'), '0012345');
  assert.equal(url.searchParams.has('search'), false);
  await client.barcode(inventoryId, ' 00 123 ', signal());
  assert.equal(new URL(called).searchParams.get('code'), '00 123');
});
test('missing/archived barcode404 is a normal null result and does not swallow a server error', async () => {
  assert.equal(
    await contextClient(async () => failure(404)).barcode(
      inventoryId,
      '00123',
      signal(),
    ),
    null,
  );
  await assert.rejects(() =>
    contextClient(async () => failure(500, 'INTERNAL_ERROR')).barcode(
      inventoryId,
      '00123',
      signal(),
    ),
  );
});
test('barcode form is Enter-submit, uses navigation state for prefill, and contains no camera/storage API', async () => {
  const source = await readFile(
    new URL('../src/routes/products.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /onSubmit=/);
  assert.match(source, /state=\{\{ barcode: code \}\}/);
  assert.match(source, /code=\{lookup\}/);
  assert.doesNotMatch(
    source,
    /getUserMedia|BarcodeDetector|localStorage|sessionStorage|parseInt|parseFloat|BigInt/,
  );
});
test('missing exact barcode renders announced missing state and real create link without leaking code into URL', async (t) => {
  const item = await contextClient(async () => failure(404)).barcode(
    inventoryId,
    '0012345',
    signal(),
  );
  const router = createMemoryRouter([
    {
      path: '/',
      Component: () => (
        <BarcodeMatch item={item} code="0012345" currency="EUR" />
      ),
    },
  ]);
  t.after(() => router.dispose());
  const html = renderToStaticMarkup(<RouterProvider router={router} />);
  assert.ok(html.includes('No encontramos un producto con ese código.'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(html.includes('href="/products/new"'));
  assert.ok(html.includes('Crear producto con este código'));
  assert.ok(!html.includes('0012345'));
});
test('searched empty ProductPage renders no-results presentation independently from empty inventory', async () => {
  const page = await contextClient(async () =>
    json({ items: [], nextCursor: null }),
  ).page(inventoryId, 'missing', null, signal());
  assert.equal(page.items.length, 0);
  assert.ok(
    renderToStaticMarkup(<EmptyProducts search="missing" />).includes(
      'No encontramos productos para esa búsqueda.',
    ),
  );
  assert.ok(
    renderToStaticMarkup(<EmptyProducts search="" />).includes(
      'Aún no tienes productos.',
    ),
  );
});
test('barcode not found renders create action without barcode URL; prefilled form has seven exact fields', async (t) => {
  const ctx = productsFixture();
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const html = render(ctx, NewProductPage, { barcode: '0012345' });
  assert.ok(html.includes('value="0012345"'));
  assert.ok(!html.includes('?code='));
  assert.equal((html.match(/<input /g) ?? []).length, 7);
  assert.ok(html.includes('value="0"'));
  assert.ok(html.includes('aria-describedby="product-message"'));
});
test('CSRF precedes POST; key/body IDs match; descriptor is written only immediately before command; accepted result invalidates only own lists', async (t) => {
  const calls: string[] = [];
  let captured: CreateProductCommand | undefined;
  const ctx = productsFixture(async (url, init) => {
    calls.push(new URL(String(url)).pathname);
    if (String(url).endsWith('/csrf')) {
      assert.equal(ctx.values.size, 0);
      return json({ token: 'csrf-request-only' });
    }
    assert.ok(init?.body && typeof init.body === 'string');
    captured = JSON.parse(init.body) as CreateProductCommand;
    createSchemaValidator(contractSchemas.CreateProductCommand)(captured);
    assert.equal(
      new Headers(init.headers).get('idempotency-key'),
      captured.operationId,
    );
    assert.equal(
      new Headers(init.headers).get('x-csrf-token'),
      'csrf-request-only',
    );
    assert.deepEqual(JSON.parse(ctx.values.get(PENDING_PRODUCT_KEY)!), {
      operationId: captured.operationId,
      inventoryId,
      commandKind: 'PRODUCT_CREATE',
    });
    return json(strictResult(captured));
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  ctx.queries.setQueryData(productsKey(scope, 'list', ''), {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [null],
  });
  const foreignKey = productsKey(
    { ...scope, inventoryId: operationId },
    'list',
    '',
  );
  ctx.queries.setQueryData(foreignKey, 'foreign-canary');
  await ctx.products.submit(form);
  assert.equal(ctx.products.snapshot().kind, 'ACCEPTED');
  assert.equal(ctx.values.size, 0);
  assert.deepEqual(calls, [
    '/v1/session/csrf',
    `/v1/inventories/${inventoryId}/products`,
  ]);
  assert.equal(
    ctx.queries.getQueryState(productsKey(scope, 'list', ''))?.isInvalidated,
    true,
  );
  assert.equal(ctx.queries.getQueryState(foreignKey)?.isInvalidated, false);
});
test('active list refetches after accepted commit and there is no optimistic insert before response', async (t) => {
  const response = deferred<Response>(),
    postStarted = deferred<void>();
  let post: CreateProductCommand | null = null;
  let reads = 0;
  const ctx = productsFixture(async (url, init) => {
    if (String(url).endsWith('/csrf')) return json({ token: 'csrf' });
    if (init?.method === 'POST') {
      post = JSON.parse(String(init.body)) as CreateProductCommand;
      postStarted.resolve();
      return response.promise;
    }
    reads++;
    return json({ items: post ? [product] : [], nextCursor: null });
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const observer = new InfiniteQueryObserver(
    ctx.queries,
    productListOptions(ctx.client, productScope(ctx.controller)!, ''),
  );
  const stop = observer.subscribe(() => {});
  t.after(stop);
  await observer.refetch();
  const sent = ctx.products.submit(form);
  await postStarted.promise;
  assert.equal(observer.getCurrentResult().data?.pages[0]?.items.length, 0);
  assert.ok(post);
  response.resolve(json(strictResult(post)));
  await sent;
  assert.equal(reads, 2);
  assert.equal(observer.getCurrentResult().data?.pages[0]?.items.length, 1);
});
for (const outcome of ['NETWORK', '500', '503', 'MALFORMED'] as const)
  test(`unknown ${outcome} preserves IDs/body across same-tab retry, blocks editing and stores only descriptor`, async (t) => {
    const payloads: string[] = [];
    let failed = false;
    const ctx = productsFixture(async (url, init) => {
      if (String(url).endsWith('/csrf')) return json({ token: 'csrf' });
      payloads.push(String(init?.body));
      if (!failed) {
        failed = true;
        if (outcome === 'NETWORK') throw new TypeError('lost response');
        if (outcome === 'MALFORMED') return json({ private: 'bad' });
        return failure(Number(outcome), 'TEMPORARILY_UNAVAILABLE');
      }
      return json(
        strictResult(JSON.parse(String(init?.body)) as CreateProductCommand),
      );
    });
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    await ctx.products.submit(form);
    assert.equal(ctx.products.snapshot().kind, 'UNCERTAIN');
    assert.equal(ctx.products.snapshot().canRetry, true);
    const stored = ctx.values.get(PENDING_PRODUCT_KEY)!;
    assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), [
      'commandKind',
      'inventoryId',
      'operationId',
    ]);
    assert.ok(!stored.includes('0012345'));
    assert.ok(!stored.includes('Agua'));
    assert.ok(!stored.includes('csrf'));
    const html = render(ctx, NewProductPage);
    assert.match(html, /<fieldset disabled=""/);
    assert.ok(html.includes('Comprobar estado'));
    assert.ok(html.includes('Reintentar'));
    await ctx.products.submit({ ...form, name: 'different' });
    assert.equal(payloads.length, 1);
    await ctx.products.retry();
    assert.equal(payloads.length, 2);
    assert.equal(payloads[0], payloads[1]);
    assert.equal(ctx.values.size, 0);
  });
test('retry CSRF failure does not erase the original unknown descriptor', async (t) => {
  let csrfCalls = 0;
  const ctx = productsFixture(async (url) => {
    if (String(url).endsWith('/csrf'))
      return ++csrfCalls === 1
        ? json({ token: 'csrf' })
        : failure(503, 'TEMPORARILY_UNAVAILABLE');
    throw new Error('lost');
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.products.submit(form);
  const stored = ctx.values.get(PENDING_PRODUCT_KEY);
  await ctx.products.retry();
  assert.equal(ctx.values.get(PENDING_PRODUCT_KEY), stored);
  assert.equal(ctx.products.snapshot().kind, 'UNCERTAIN');
});
for (const [status, code] of [
  [400, 'VALIDATION_ERROR'],
  [404, 'NOT_FOUND'],
  [409, 'IDEMPOTENCY_KEY_REUSED'],
  [422, 'DOMAIN_RULE'],
  [429, 'RATE_LIMITED'],
] as const)
  test(`known terminal ${status} clears descriptor and uses safe feedback`, async (t) => {
    const ctx = productsFixture(async (url) =>
      String(url).endsWith('/csrf')
        ? json({ token: 'csrf' })
        : failure(status, code),
    );
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    await ctx.products.submit(form);
    assert.equal(ctx.products.snapshot().kind, 'ERROR');
    assert.equal(ctx.values.size, 0);
    assert.ok(!ctx.products.snapshot().message.includes('Public message'));
  });
test('client validation and CSRF failure never store/send a command', async (t) => {
  let calls = 0;
  const ctx = productsFixture(async () => {
    calls++;
    return failure(503, 'TEMPORARILY_UNAVAILABLE');
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.products.submit({ ...form, initialStock: '2' });
  assert.equal(calls, 0);
  assert.equal(ctx.products.snapshot().field, 'initialUnitCost');
  await ctx.products.submit(form);
  assert.equal(calls, 1);
  assert.equal(ctx.values.size, 0);
  assert.equal(ctx.products.snapshot().kind, 'ERROR');
});
test('single flight prevents a second command while first response is pending', async (t) => {
  const pending = deferred<Response>(),
    postStarted = deferred<void>();
  let posts = 0;
  const ctx = productsFixture(async (url) => {
    if (String(url).endsWith('/csrf')) return json({ token: 'csrf' });
    posts++;
    postStarted.resolve();
    return pending.promise;
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const first = ctx.products.submit(form);
  await ctx.products.submit({ ...form, name: 'different' });
  await postStarted.promise;
  assert.equal(posts, 1);
  pending.resolve(failure(422, 'DOMAIN_RULE'));
  await first;
});
test('reload checks receipt before enabling submit, without generating IDs or recreating lost payload', async (t) => {
  const pending = deferred<Response>();
  const calls: string[] = [];
  const ctx = productsFixture(async (url) => {
    calls.push(String(url));
    return pending.promise;
  }, descriptor());
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  assert.equal(ctx.products.snapshot().kind, 'CHECKING');
  await ctx.products.submit(form);
  assert.equal(calls.length, 1);
  assert.equal(
    new URL(calls[0]!).pathname,
    `/v1/inventories/${inventoryId}/operations/${operationId}`,
  );
  pending.resolve(failure(404));
  await settled(ctx.products);
  assert.equal(ctx.products.snapshot().kind, 'UNCERTAIN');
  assert.equal(ctx.products.snapshot().canRetry, false);
  assert.equal(ctx.values.get(PENDING_PRODUCT_KEY), descriptor());
  await ctx.products.retry();
  await ctx.products.submit(form);
  assert.equal(calls.length, 1);
});
for (const status of ['ACCEPTED', 'CONFLICT', 'REJECTED'] as const)
  test(`reload ${status} clears descriptor; ACCEPTED invalidates lists with truthful feedback`, async (t) => {
    const ctx = productsFixture(
      async () => json(receipt(status)),
      descriptor(),
    );
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    await settled(ctx.products);
    assert.equal(ctx.values.size, 0);
    assert.equal(
      ctx.products.snapshot().kind,
      status === 'ACCEPTED' ? 'ACCEPTED' : 'ERROR',
    );
    if (status === 'ACCEPTED')
      assert.equal(
        ctx.products.snapshot().message,
        'El producto anterior sí fue registrado.',
      );
  });
test('conscious discard clears descriptor and a new ID appears only on subsequent submit', async (t) => {
  const ctx = productsFixture(
    async (url, init) =>
      String(url).includes('/operations/')
        ? failure(404)
        : String(url).endsWith('/csrf')
          ? json({ token: 'csrf' })
          : json(
              strictResult(
                JSON.parse(String(init?.body)) as CreateProductCommand,
              ),
            ),
    descriptor(),
  );
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await settled(ctx.products);
  ctx.products.discard();
  assert.equal(ctx.values.size, 0);
  assert.equal(ctx.products.snapshot().kind, 'READY');
  await ctx.products.submit(form);
  assert.equal(ctx.products.snapshot().kind, 'ACCEPTED');
});
test('logout clears descriptor and query cache, ignores delayed accepted receipt', async (t) => {
  const pending = deferred<Response>();
  const ctx = productsFixture(async () => pending.promise, descriptor());
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.controller.logout();
  assert.equal(ctx.values.size, 0);
  assert.equal(ctx.queries.getQueryCache().getAll().length, 0);
  pending.resolve(json(receipt('ACCEPTED')));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(ctx.products.snapshot().kind, 'READY');
});
test('first hydration with different Inventory never queries previous owner receipt', async (t) => {
  let calls = 0;
  const ctx = productsFixture(async () => {
    calls++;
    return json(receipt('ACCEPTED'));
  }, descriptor(operationId));
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  assert.equal(calls, 0);
  assert.equal(ctx.values.size, 0);
});
test('User A to B refresh clears pending and B never probes A operation', async (t) => {
  let current = identity,
    currentMe = me,
    calls = 0;
  const session = fixture(
    { session: async () => current },
    { me: async () => currentMe },
  );
  const memory = memoryStorage();
  const client = contextClient(async (url) => {
    if (String(url).endsWith('/csrf')) return json({ token: 'csrf' });
    if (String(url).includes('/operations/')) calls++;
    throw new Error('lost');
  });
  const controller = new ProductsController(
    client,
    session.controller,
    session.queries,
    memory.storage,
    () => true,
  );
  t.after(() => {
    controller.dispose();
    session.controller.dispose();
    session.queries.clear();
  });
  await session.controller.refresh();
  await controller.submit(form);
  assert.equal(memory.values.size, 1);
  current = { ...identity, userId: 'user-b', sessionId: 'session-b' };
  currentMe = {
    ...me,
    user: { ...me.user, id: 'user-b' },
    inventory: { ...me.inventory!, id: operationId },
  };
  await session.controller.refresh();
  await controller.check();
  assert.equal(calls, 0);
  assert.equal(memory.values.size, 0);
  assert.equal(controller.snapshot().kind, 'READY');
});
for (const [status, code] of [
  [401, 'UNAUTHENTICATED'],
  [403, 'EMAIL_NOT_VERIFIED'],
  [403, 'CLOUD_ACCESS_DISABLED'],
] as const)
  test(`business ${status}/${code} delegates session boundary and removes commerce`, async (t) => {
    const ctx = productsFixture(async (url) =>
      String(url).endsWith('/csrf')
        ? json({ token: 'csrf' })
        : failure(status, code),
    );
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    await ctx.products.submit(form);
    assert.equal(productScope(ctx.controller), null);
    assert.equal(ctx.values.size, 0);
    assert.equal(ctx.queries.getQueryCache().getAll().length, 0);
  });
test('pending storage rejects excess/commercial fields and invalid identifiers', () => {
  for (const text of [
    'invalid JSON',
    JSON.stringify({ ...JSON.parse(descriptor()), barcode: '00123' }),
    JSON.stringify({
      operationId: 'bad',
      inventoryId,
      commandKind: 'PRODUCT_CREATE',
    }),
  ]) {
    const memory = memoryStorage(text);
    assert.equal(readPending(memory.storage), null);
    assert.equal(memory.values.size, 0);
  }
});
test('accepted recovery can be acknowledged before a fresh form; only a later submit creates another intention', async (t) => {
  let posts = 0,
    nextOperation = '';
  const ctx = productsFixture(async (url, init) => {
    if (String(url).includes('/operations/')) return json(receipt('ACCEPTED'));
    if (String(url).endsWith('/csrf')) return json({ token: 'csrf' });
    posts++;
    const command = JSON.parse(String(init?.body)) as CreateProductCommand;
    nextOperation = command.operationId;
    return json(strictResult(command));
  }, descriptor());
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await settled(ctx.products);
  assert.ok(
    render(ctx, NewProductPage).includes(
      'El producto anterior sí fue registrado.',
    ),
  );
  ctx.products.acknowledge();
  assert.equal(posts, 0);
  assert.equal(ctx.products.snapshot().kind, 'READY');
  await ctx.products.submit(form);
  assert.equal(posts, 1);
  assert.notEqual(nextOperation, operationId);
});
test('invalid first session clears pending without querying an operation', async (t) => {
  let calls = 0;
  const ctx = productsFixture(async () => {
    calls++;
    return json(receipt('ACCEPTED'));
  }, descriptor());
  t.after(() => ctx.dispose());
  ctx.auth.session = async () => null;
  await ctx.controller.refresh();
  assert.equal(calls, 0);
  assert.equal(ctx.values.size, 0);
  assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
});
test('rate-limited receipt preserves uncertainty and displays numeric Retry-After', async (t) => {
  const ctx = productsFixture(
    async () =>
      json(
        { error: { code: 'RATE_LIMITED', message: 'm', requestId: 'r' } },
        429,
        { 'retry-after': '12' },
      ),
    descriptor(),
  );
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await settled(ctx.products);
  assert.equal(ctx.products.snapshot().kind, 'UNCERTAIN');
  assert.equal(ctx.values.get(PENDING_PRODUCT_KEY), descriptor());
  assert.ok(ctx.products.snapshot().message.includes('12 segundos'));
});
test('receipt mismatched operation or Inventory cannot confirm a command', async () => {
  const accepted = receipt('ACCEPTED');
  assert.equal(accepted.status, 'ACCEPTED');
  for (const body of [
    { ...accepted, operationId: productId },
    {
      ...accepted,
      changeSet: { ...accepted.changeSet, inventoryId: productId },
    },
  ])
    await assert.rejects(() =>
      contextClient(async () => json(body)).receipt(
        inventoryId,
        operationId,
        signal(),
      ),
    );
});
test('429 exposes only validated numeric retry-after', async (t) => {
  const ctx = productsFixture(async (url) =>
    String(url).endsWith('/csrf')
      ? json({ token: 'csrf' })
      : json(
          { error: { code: 'RATE_LIMITED', message: 'm', requestId: 'r' } },
          429,
          { 'retry-after': '12' },
        ),
  );
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.products.submit(form);
  assert.ok(ctx.products.snapshot().message.includes('12 segundos'));
});
test('recovery receipt refetches an active Product list and leaves unrelated cache untouched', async (t) => {
  let pending = false,
    reads = 0;
  let sentCommand: CreateProductCommand | null = null;
  const ctx = productsFixture(async (url, options) => {
    if (String(url).endsWith('/csrf')) return json({ token: 'csrf' });
    if (String(url).includes('/operations/')) {
      assert.ok(sentCommand);
      const accepted = receipt('ACCEPTED');
      assert.equal(accepted.status, 'ACCEPTED');
      if (accepted.status !== 'ACCEPTED') throw new Error('Fixture status');
      const created = strictResult(sentCommand);
      accepted.changeSet.upserts.products = [created.product];
      accepted.changeSet.upserts.inventoryStates = [created.state];
      return json({ ...accepted, operationId: sentCommand.operationId });
    }
    if (String(url).endsWith('/products') && pending) {
      sentCommand = JSON.parse(String(options?.body));
      throw new Error('lost');
    }
    reads++;
    return json({ items: pending ? [product] : [], nextCursor: null });
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  const observer = new QueryObserver(ctx.queries, {
    queryKey: productsKey(scope, 'list', ''),
    queryFn: ({ signal: querySignal }) =>
      ctx.client.page(inventoryId, '', null, querySignal),
  });
  const stop = observer.subscribe(() => {});
  t.after(stop);
  await observer.refetch();
  pending = true;
  await ctx.products.submit(form);
  assert.equal(ctx.products.snapshot().kind, 'UNCERTAIN');
  // The list is allowed to fetch after receipt; only the first command response was lost.
  pending = false;
  await ctx.products.check();
  assert.equal(ctx.products.snapshot().kind, 'ACCEPTED');
  assert.equal(reads, 2);
});
