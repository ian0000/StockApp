import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type {
  UpdateProductCommand,
  ArchiveProductCommand,
  ProductMutationResult,
} from '@stock-app/contracts';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import { createApiClient, ApiClientError } from '../src/api/client.js';
import { createProductsClient } from '../src/products/client.js';
import { productScope, productsKey } from '../src/products/controller.js';
import { productDetailOptions } from '../src/products/queries.js';
import {
  initialEditDraft,
  editField,
  rebaseDraft,
  buildUpdateCommand,
  buildArchiveCommand,
} from '../src/products/edit.js';
import {
  ProductFacts,
  ProductDetailPage,
  EditProductPage,
  ArchiveConfirmation,
  ARCHIVE_WARNING,
} from '../src/routes/product-detail.js';
import { ProductsContext } from '../src/products/context.js';
import { SessionProvider } from '../src/auth/context.js';
import { PENDING_PRODUCT_KEY, readPending } from '../src/products/pending.js';
import {
  productsFixture,
  product,
  productId,
  inventoryId,
  operationId,
  json,
  failure,
  receipt,
  settled,
  memoryStorage,
} from './product-fixtures.js';
import { deferred, identity, me } from './session-fixtures.js';

type MetadataCommand = UpdateProductCommand | ArchiveProductCommand;
function result(command: MetadataCommand): ProductMutationResult {
  return {
    product: {
      ...product.product,
      ...(command.commandKind === 'PRODUCT_UPDATE'
        ? {
            name: command.payload.name,
            variant: command.payload.variant,
            barcode: command.payload.barcode,
            regularSalePrice: command.payload.regularSalePrice,
            minimumStock: command.payload.minimumStock,
          }
        : { isArchived: true }),
      metadataRevision: String(
        BigInt(command.preconditions.expectedMetadataRevision) + 1n,
      ),
    },
    committedRevision: '5',
    serverRecordedAt: 1,
  };
}
function client(fetcher: typeof fetch) {
  return createProductsClient(
    createApiClient({ baseUrl: 'https://api.example.test', fetcher }),
  );
}
const signal = () => new AbortController().signal;
const csrf = () => json({ token: 'test-csrf' });
function render(
  ctx: ReturnType<typeof productsFixture>,
  edit = false,
  id = productId,
) {
  const router = createMemoryRouter(
    [
      { path: '/products/:id', Component: ProductDetailPage },
      { path: '/products/:id/edit', Component: EditProductPage },
    ],
    { initialEntries: [`/products/${id}${edit ? '/edit' : ''}`] },
  );
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
test('detail GET validates shared ProductRead and case-insensitive own identities without CSRF or writes', async () => {
  const calls: string[] = [];
  const c = client(async (input, options) => {
    calls.push(String(input));
    assert.equal(options?.method, 'GET');
    assert.equal(new Headers(options?.headers).get('Idempotency-Key'), null);
    return json(product);
  });
  assert.deepEqual(
    await c.detail(
      inventoryId.toUpperCase(),
      productId.toUpperCase(),
      signal(),
    ),
    product,
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith(`/products/${productId.toUpperCase()}`));
});
for (const [label, body] of [
  ['malformed', {}],
  ['additional property', { ...product, stock: 99 }],
  [
    'foreign inventory',
    { ...product, product: { ...product.product, inventoryId: operationId } },
  ],
  [
    'foreign state inventory',
    { ...product, state: { ...product.state, inventoryId: operationId } },
  ],
  [
    'foreign state product',
    { ...product, state: { ...product.state, productId: operationId } },
  ],
  [
    'different route product',
    {
      ...product,
      product: { ...product.product, id: operationId },
      state: { ...product.state, productId: operationId },
    },
  ],
  [
    'archived',
    { ...product, product: { ...product.product, isArchived: true } },
  ],
] as const)
  test(`detail rejects ${label} safely`, async () =>
    assert.rejects(
      client(async () => json(body)).detail(inventoryId, productId, signal()),
      (error: unknown) =>
        error instanceof ApiClientError && error.kind === 'INVALID_JSON',
    ));
for (const status of [401, 403, 429, 500])
  test(`detail preserves HTTP ${status} for the existing auth/rate/error boundaries`, async () =>
    assert.rejects(
      client(async () =>
        failure(
          status,
          status === 401
            ? 'UNAUTHENTICATED'
            : status === 403
              ? 'CLOUD_ACCESS_DISABLED'
              : status === 429
                ? 'RATE_LIMITED'
                : 'INTERNAL_ERROR',
        ),
      ).detail(inventoryId, productId, signal()),
      (error: unknown) =>
        error instanceof ApiClientError && error.status === status,
    ));
test('404 hides cached detail including foreign or archived state with generic unavailable copy', async (t) => {
  const ctx = productsFixture(async () => failure(404));
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const scope = productScope(ctx.controller)!;
  ctx.queries.setQueryData(productsKey(scope, 'detail', productId), product);
  await ctx.queries.fetchQuery({
    ...productDetailOptions(ctx.client, scope, productId),
    staleTime: 0,
  });
  const html = render(ctx);
  assert.match(html, /Producto no disponible/);
  assert.match(html, /Volver a productos/);
  assert.ok(!html.includes('Agua') && !html.includes('Archivar producto'));
});
for (const [cost, price, margin, markup] of [
  [null, '1234567', null, null],
  ['0', '0', '0', '0'],
  ['10666666', '9999999', '-666667', '-625000'],
] as const)
  test(`detail presentation retains financial null/zero/negative fields for cost ${cost}`, () => {
    const item = {
      ...product,
      product: { ...product.product, regularSalePrice: price },
      state: { ...product.state, unitCost: cost },
      margin,
      markup,
    };
    const before = JSON.stringify(item);
    const html = renderToStaticMarkup(
      <ProductFacts item={item} currency="USD" />,
    );
    for (const label of [
      'Variante',
      'Código de barras',
      'Stock actual',
      'Costo promedio',
      'Precio habitual',
      'Stock mínimo',
      'Stock bajo',
      'Margen',
      'Markup',
    ])
      assert.ok(html.includes(label));
    assert.ok(html.includes('-2') && html.includes('0012345'));
    assert.ok(
      !html.includes('metadataRevision') &&
        !html.includes('stateRevision') &&
        !html.includes(productId),
    );
    assert.equal(JSON.stringify(item), before);
    if (cost === null) assert.match(html, /No disponible/);
    else if (cost === '0') assert.match(html, /0\.00%/);
    else assert.match(html, /-0\.67%/);
  });
test('detail exposes edit, archive and adjustment placeholder link; edit exposes only five metadata fields', async (t) => {
  const ctx = productsFixture();
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  ctx.queries.setQueryData(
    productsKey(productScope(ctx.controller)!, 'detail', productId),
    product,
  );
  const detail = render(ctx);
  assert.match(detail, /Archivar producto/);
  assert.ok(detail.includes(`/adjustments/new?productId=${productId}`));
  const edit = render(ctx, true);
  assert.equal((edit.match(/<input /g) ?? []).length, 5);
  assert.match(edit, /Guardar cambios/);
  assert.ok(
    !edit.includes('Stock inicial') && !edit.includes('Costo promedio'),
  );
  assert.match(edit, /name="regularSalePrice"[^>]*value="1\.12"/);
});
test('archive confirmation has accessible warning and explicit cancel/confirm buttons, with no deletion action', () => {
  let calls = 0;
  const html = renderToStaticMarkup(
    <ArchiveConfirmation
      disabled={false}
      cancel={() => calls++}
      confirm={() => calls++}
    />,
  );
  assert.ok(html.includes(ARCHIVE_WARNING));
  assert.match(html, /aria-labelledby="archive-heading"/);
  assert.match(html, /tabindex="-1"/);
  assert.equal((html.match(/type="button"/g) ?? []).length, 2);
  assert.match(html, /Cancelar/);
  assert.equal(calls, 0);
  assert.ok(!html.includes('Eliminar'));
});
for (const kind of ['PRODUCT_UPDATE', 'PRODUCT_ARCHIVE'] as const) {
  const command = () =>
    kind === 'PRODUCT_UPDATE'
      ? buildUpdateCommand(initialEditDraft(product.product))
      : buildArchiveCommand(product.product);
  test(`${kind} sends exact scoped command with CSRF and idempotency header; never DELETE or State/history writes`, async () => {
    const calls: string[] = [];
    const cmd = command();
    const c = client(async (input, options) => {
      calls.push(String(input));
      if (String(input).endsWith('/csrf')) return csrf();
      assert.equal(
        options?.method,
        kind === 'PRODUCT_UPDATE' ? 'PATCH' : 'POST',
      );
      assert.equal(
        new Headers(options?.headers).get('X-CSRF-Token'),
        'test-csrf',
      );
      assert.equal(
        new Headers(options?.headers).get('Idempotency-Key'),
        cmd.operationId,
      );
      assert.deepEqual(JSON.parse(String(options?.body)), cmd);
      return json(result(cmd));
    });
    let ready = 0;
    const response = await c.mutate(inventoryId, cmd, signal(), () => ready++);
    createSchemaValidator(contractSchemas.ProductMutationResult)(response);
    assert.equal(response.product.isArchived, kind === 'PRODUCT_ARCHIVE');
    assert.equal(ready, 1);
    assert.equal(calls.length, 2);
    assert.ok(
      calls[1].endsWith(
        `/products/${productId}${kind === 'PRODUCT_ARCHIVE' ? '/archive' : ''}`,
      ),
    );
  });
  for (const corruption of [
    'shape',
    'identity',
    'inventory',
    'archived',
  ] as const)
    test(`${kind} rejects malformed ${corruption} mutation success without asserting success`, async () => {
      const cmd = command(),
        valid = result(cmd);
      const body =
        corruption === 'shape'
          ? {}
          : {
              ...valid,
              product: {
                ...valid.product,
                ...(corruption === 'identity'
                  ? { id: operationId }
                  : corruption === 'inventory'
                    ? { inventoryId: operationId }
                    : { isArchived: kind !== 'PRODUCT_ARCHIVE' }),
              },
            };
      await assert.rejects(
        client(async (input) =>
          String(input).endsWith('/csrf') ? csrf() : json(body),
        ).mutate(inventoryId, cmd, signal(), () => {}),
        (error: unknown) =>
          error instanceof ApiClientError && error.kind === 'INVALID_JSON',
      );
    });
  for (const problem of [
    'network',
    'timeout',
    '500',
    '503',
    'malformed',
  ] as const)
    test(`${kind} ${problem} is uncertain and retry keeps exact body/key/three-key descriptor`, async (t) => {
      const sends: string[] = [];
      let recovered = false;
      const ctx = productsFixture(async (input, options) => {
        if (String(input).endsWith('/csrf')) return csrf();
        sends.push(String(options?.body));
        const cmd: MetadataCommand = JSON.parse(String(options?.body));
        assert.equal(
          new Headers(options?.headers).get('Idempotency-Key'),
          cmd.operationId,
        );
        if (recovered) return json(result(cmd));
        if (problem === 'network') throw new TypeError('lost ACK');
        if (problem === 'timeout')
          throw new DOMException('timeout', 'TimeoutError');
        return problem === 'malformed'
          ? json({})
          : failure(Number(problem), 'INTERNAL_ERROR');
      });
      t.after(() => ctx.dispose());
      await ctx.controller.refresh();
      if (kind === 'PRODUCT_UPDATE')
        await ctx.products.update(initialEditDraft(product.product));
      else await ctx.products.archive(product.product);
      assert.equal(ctx.products.snapshot().kind, 'UNCERTAIN');
      const stored = JSON.parse(ctx.values.get(PENDING_PRODUCT_KEY)!);
      assert.deepEqual(Object.keys(stored).sort(), [
        'commandKind',
        'inventoryId',
        'operationId',
      ]);
      assert.equal(stored.commandKind, kind);
      await ctx.products.update(initialEditDraft(product.product));
      await ctx.products.archive(product.product);
      assert.equal(sends.length, 1);
      recovered = true;
      await ctx.products.retry();
      assert.equal(sends.length, 2);
      assert.equal(sends[0], sends[1]);
      assert.equal(ctx.products.snapshot().kind, 'ACCEPTED');
      assert.equal(ctx.values.size, 0);
    });
  test(`${kind} scoped invalidation leaves auth and other inventory intact; archive never GETs archived detail`, async (t) => {
    const ctx = productsFixture(async (input, options) =>
      String(input).endsWith('/csrf')
        ? csrf()
        : options?.method !== 'GET'
          ? json(result(JSON.parse(String(options?.body))))
          : json(product),
    );
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    const scope = productScope(ctx.controller)!;
    const keys = [
      productsKey(scope, 'list', ''),
      productsKey(scope, 'list', 'agua'),
      productsKey(scope, 'barcode', '0012345'),
      productsKey(scope, 'detail', productId),
    ];
    for (const key of keys)
      ctx.queries.setQueryData(
        key,
        key.includes('detail') ? product : 'cached',
      );
    ctx.queries.setQueryData(['private', scope.generation, 'auth'], 'auth');
    ctx.queries.setQueryData(['other', 'products'], 'other');
    if (kind === 'PRODUCT_UPDATE')
      await ctx.products.update(initialEditDraft(product.product));
    else await ctx.products.archive(product.product);
    for (const key of keys.slice(0, 3))
      assert.equal(ctx.queries.getQueryState(key)?.isInvalidated, true);
    assert.equal(ctx.queries.getQueryData(['other', 'products']), 'other');
    assert.equal(
      ctx.queries.getQueryData(['private', scope.generation, 'auth']),
      'auth',
    );
    if (kind === 'PRODUCT_ARCHIVE')
      assert.equal(ctx.queries.getQueryData(keys[3]), undefined);
  });
  for (const outcome of ['ACCEPTED', 'CONFLICT', 'REJECTED', '404'] as const)
    test(`${kind} reload ${outcome} consults receipt before allowing a new command and never recreates payload`, async (t) => {
      const calls: string[] = [];
      const r = receipt(outcome === '404' ? 'REJECTED' : outcome);
      if (r.status === 'ACCEPTED' && kind === 'PRODUCT_ARCHIVE')
        r.changeSet.upserts.products = r.changeSet.upserts.products.map(
          (p) => ({ ...p, isArchived: true }),
        );
      const ctx = productsFixture(
        async (input, options) => {
          calls.push(String(input));
          assert.ok(!options?.body);
          return outcome === '404' ? failure(404) : json(r);
        },
        JSON.stringify({ operationId, inventoryId, commandKind: kind }),
      );
      t.after(() => ctx.dispose());
      await ctx.controller.refresh();
      await settled(ctx.products);
      assert.equal(calls.length, 1);
      assert.ok(calls[0].endsWith(`/operations/${operationId}`));
      assert.equal(
        ctx.products.snapshot().kind,
        outcome === 'ACCEPTED'
          ? 'ACCEPTED'
          : outcome === '404'
            ? 'UNCERTAIN'
            : 'ERROR',
      );
      if (outcome === '404') {
        assert.equal(ctx.products.snapshot().canRetry, false);
        await ctx.products.retry();
        assert.equal(calls.length, 1);
        assert.equal(ctx.values.size, 1);
        ctx.products.discard();
      }
      assert.equal(ctx.values.size, 0);
      if (outcome === 'ACCEPTED')
        assert.equal(
          ctx.products.snapshot().message,
          kind === 'PRODUCT_UPDATE'
            ? 'El cambio anterior sí fue guardado.'
            : 'El producto anterior fue archivado.',
        );
    });
  test(`${kind} foreign descriptor/session boundary clears storage before receipt access`, async (t) => {
    let calls = 0;
    const ctx = productsFixture(
      async () => {
        calls++;
        return json({});
      },
      JSON.stringify({
        operationId,
        inventoryId: operationId,
        commandKind: kind,
      }),
    );
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    await settled(ctx.products);
    assert.equal(calls, 0);
    assert.equal(ctx.values.size, 0);
  });
  test(`${kind} conflict is terminal, fetches latest, blocks retry and requires explicit review with new operation`, async (t) => {
    const commands: MetadataCommand[] = [];
    let get = 0;
    const latest = {
      ...product,
      product: {
        ...product.product,
        name: 'Server',
        regularSalePrice: '2345678',
        metadataRevision: '9223372036854775806',
      },
    };
    const ctx = productsFixture(async (input, options) => {
      if (String(input).endsWith('/csrf')) return csrf();
      if (options?.method === 'GET') {
        get++;
        return json(latest);
      }
      const cmd: MetadataCommand = JSON.parse(String(options?.body));
      commands.push(cmd);
      return commands.length === 1
        ? failure(409, 'REVISION_CONFLICT')
        : json(result(cmd));
    });
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    const draft = editField(initialEditDraft(product.product), 'name', 'Local');
    if (kind === 'PRODUCT_UPDATE') await ctx.products.update(draft);
    else await ctx.products.archive(product.product);
    assert.equal(ctx.products.snapshot().kind, 'CONFLICT');
    assert.equal(get, 1);
    assert.equal(ctx.values.size, 0);
    assert.deepEqual(ctx.products.snapshot().latest, latest);
    await ctx.products.retry();
    await ctx.products.update(draft);
    await ctx.products.archive(latest.product);
    assert.equal(commands.length, 1);
    assert.match(
      render(ctx, kind === 'PRODUCT_UPDATE'),
      kind === 'PRODUCT_UPDATE'
        ? /Revisar con la versión actual/
        : /Tus cambios no se guardaron/,
    );
    ctx.products.resolveConflict();
    assert.equal(commands.length, 1);
    if (kind === 'PRODUCT_UPDATE')
      await ctx.products.update(rebaseDraft(draft, latest.product));
    else await ctx.products.archive(latest.product);
    assert.equal(commands.length, 2);
    assert.notEqual(commands[0].operationId, commands[1].operationId);
    assert.equal(
      commands[1].preconditions.expectedMetadataRevision,
      latest.product.metadataRevision,
    );
    if (commands[1].commandKind === 'PRODUCT_UPDATE') {
      assert.equal(commands[1].payload.name, 'Local');
      assert.equal(commands[1].payload.regularSalePrice, '2345678');
    }
  });
  test(`${kind} post-conflict missing detail remains unavailable without auto mutation`, async (t) => {
    let sends = 0;
    const ctx = productsFixture(async (input, options) => {
      if (String(input).endsWith('/csrf')) return csrf();
      if (options?.method === 'GET') return failure(404);
      sends++;
      return failure(409, 'REVISION_CONFLICT');
    });
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    if (kind === 'PRODUCT_UPDATE')
      await ctx.products.update(initialEditDraft(product.product));
    else await ctx.products.archive(product.product);
    assert.equal(ctx.products.snapshot().latest, null);
    assert.match(render(ctx), /Producto no disponible/);
    assert.equal(sends, 1);
  });
}
test('in-flight metadata mutation cannot optimistically replace cache; session expiry ignores late response and clears draft descriptor', async (t) => {
  const response = deferred<Response>(),
    sent = deferred<void>();
  const ctx = productsFixture(async (input) => {
    if (String(input).endsWith('/csrf')) return csrf();
    sent.resolve();
    return response.promise;
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const key = productsKey(productScope(ctx.controller)!, 'detail', productId);
  ctx.queries.setQueryData(key, product);
  const pending = ctx.products.update(
    editField(initialEditDraft(product.product), 'name', 'Local'),
  );
  await sent.promise;
  assert.equal(ctx.queries.getQueryData(key), product);
  assert.equal(ctx.products.snapshot().kind, 'SENDING');
  ctx.controller.expire();
  assert.equal(ctx.values.size, 0);
  response.resolve(
    json(result(buildUpdateCommand(initialEditDraft(product.product)))),
  );
  await pending;
  assert.equal(ctx.products.snapshot().kind, 'READY');
  assert.equal(ctx.queries.getQueryData(key), undefined);
});
test('minimal storage validates all three kinds and rejects any persisted product/revision/payload', () => {
  for (const commandKind of [
    'PRODUCT_CREATE',
    'PRODUCT_UPDATE',
    'PRODUCT_ARCHIVE',
  ]) {
    const descriptor = { operationId, inventoryId, commandKind };
    assert.deepEqual(
      readPending(memoryStorage(JSON.stringify(descriptor)).storage),
      descriptor,
    );
    for (const extra of [{ productId }, { revision: '0' }, { payload: {} }])
      assert.equal(
        readPending(
          memoryStorage(JSON.stringify({ ...descriptor, ...extra })).storage,
        ),
        null,
      );
  }
});
test('active detail query refetches actual Product after update without optimistic cache insertion', async (t) => {
  let current = product,
    gets = 0;
  const ctx = productsFixture(async (input, options) => {
    if (String(input).endsWith('/csrf')) return csrf();
    if (options?.method !== 'GET') {
      const body = result(JSON.parse(String(options?.body)));
      current = { ...product, product: body.product };
      return json(body);
    }
    gets++;
    return json(current);
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const observer = new QueryObserver(
    ctx.queries,
    productDetailOptions(ctx.client, productScope(ctx.controller)!, productId),
  );
  const stop = observer.subscribe(() => {});
  t.after(stop);
  await observer.refetch();
  const before = gets;
  await ctx.products.update(
    editField(initialEditDraft(product.product), 'name', 'Updated'),
  );
  assert.ok(gets > before);
  assert.equal(observer.getCurrentResult().data?.product.name, 'Updated');
});

for (const kind of ['PRODUCT_UPDATE', 'PRODUCT_ARCHIVE'] as const) {
  for (const [status, code] of [
    [401, 'UNAUTHENTICATED'],
    [403, 'CLOUD_ACCESS_DISABLED'],
    [429, 'RATE_LIMITED'],
    [404, 'NOT_FOUND'],
  ] as const)
    test(`${kind} definitive ${status} clears pending and respects the existing boundary`, async (t) => {
      const ctx = productsFixture(async (input) =>
        String(input).endsWith('/csrf') ? csrf() : failure(status, code),
      );
      t.after(() => ctx.dispose());
      await ctx.controller.refresh();
      const scope = productScope(ctx.controller)!;
      ctx.queries.setQueryData(
        productsKey(scope, 'detail', productId),
        product,
      );
      if (kind === 'PRODUCT_UPDATE')
        await ctx.products.update(initialEditDraft(product.product));
      else await ctx.products.archive(product.product);
      assert.equal(ctx.values.size, 0);
      assert.notEqual(ctx.products.snapshot().kind, 'UNCERTAIN');
      if (status === 401)
        assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
      if (status === 403) assert.equal(productScope(ctx.controller), null);
      if (status === 429)
        assert.match(ctx.products.snapshot().message, /Demasiados intentos/);
      if (status === 404) assert.match(render(ctx), /Producto no disponible/);
    });
  test(`${kind} account A to B clears descriptor and never queries A receipt as B`, async (t) => {
    const paths: string[] = [];
    const ctx = productsFixture(async (input) => {
      paths.push(String(input));
      return String(input).endsWith('/csrf')
        ? csrf()
        : failure(503, 'TEMPORARILY_UNAVAILABLE');
    });
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    if (kind === 'PRODUCT_UPDATE')
      await ctx.products.update(initialEditDraft(product.product));
    else await ctx.products.archive(product.product);
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
    await ctx.products.check();
    assert.equal(ctx.values.size, 0);
    assert.equal(ctx.products.snapshot().kind, 'READY');
    assert.ok(paths.every((path) => !path.includes('/operations/')));
  });
  test(`${kind} uncertain retry that fails before CSRF send preserves the original operation`, async (t) => {
    let csrfCalls = 0,
      sends = 0;
    const ctx = productsFixture(async (input) => {
      if (String(input).endsWith('/csrf'))
        return ++csrfCalls === 1 ? csrf() : failure(429, 'RATE_LIMITED');
      sends++;
      throw new TypeError('lost response');
    });
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    if (kind === 'PRODUCT_UPDATE')
      await ctx.products.update(initialEditDraft(product.product));
    else await ctx.products.archive(product.product);
    const previous = ctx.values.get(PENDING_PRODUCT_KEY);
    await ctx.products.retry();
    assert.equal(ctx.products.snapshot().kind, 'UNCERTAIN');
    assert.equal(ctx.values.get(PENDING_PRODUCT_KEY), previous);
    assert.equal(sends, 1);
  });
  test(`${kind} reload terminal revision conflict with no payload refetches visible detail and allows conscious reconstruction`, async (t) => {
    const r = {
      operationId,
      status: 'CONFLICT',
      error: { code: 'REVISION_CONFLICT', message: 'Public', requestId: 'r' },
    };
    const ctx = productsFixture(
      async (input) =>
        String(input).includes('/operations/') ? json(r) : json(product),
      JSON.stringify({ operationId, inventoryId, commandKind: kind }),
    );
    t.after(() => ctx.dispose());
    await ctx.controller.refresh();
    await settled(ctx.products);
    assert.equal(ctx.values.size, 0);
    assert.equal(ctx.products.snapshot().kind, 'ERROR');
    await ctx.queries.fetchQuery(
      productDetailOptions(
        ctx.client,
        productScope(ctx.controller)!,
        productId,
      ),
    );
    assert.match(
      render(ctx, kind === 'PRODUCT_UPDATE'),
      kind === 'PRODUCT_UPDATE' ? /Guardar cambios/ : /Archivar producto/,
    );
  });
}
test('failed conflict refresh can retry the authoritative GET without another mutation', async (t) => {
  let reads = 0,
    writes = 0;
  const ctx = productsFixture(async (input, options) => {
    if (String(input).endsWith('/csrf')) return csrf();
    if (options?.method === 'GET')
      return ++reads === 1
        ? failure(503, 'TEMPORARILY_UNAVAILABLE')
        : json({
            ...product,
            product: { ...product.product, metadataRevision: '3' },
          });
    writes++;
    return failure(409, 'REVISION_CONFLICT');
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.products.update(initialEditDraft(product.product));
  assert.equal(ctx.products.snapshot().kind, 'CONFLICT');
  assert.equal(ctx.products.snapshot().latest, undefined);
  await ctx.products.reviewConflict();
  assert.equal(reads, 2);
  assert.equal(writes, 1);
  assert.equal(ctx.products.snapshot().latest?.product.metadataRevision, '3');
});
test('active archived detail is removed and never refetched after archive success', async (t) => {
  let gets = 0;
  const ctx = productsFixture(async (input, options) => {
    if (String(input).endsWith('/csrf')) return csrf();
    if (options?.method === 'GET') {
      gets++;
      return json(product);
    }
    return json(result(JSON.parse(String(options?.body))));
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  const key = productsKey(productScope(ctx.controller)!, 'detail', productId);
  const observer = new QueryObserver(
      ctx.queries,
      productDetailOptions(
        ctx.client,
        productScope(ctx.controller)!,
        productId,
      ),
    ),
    stop = observer.subscribe(() => {});
  t.after(stop);
  await observer.refetch();
  const before = gets;
  await ctx.products.archive(product.product);
  assert.equal(gets, before);
  assert.equal(ctx.queries.getQueryData(key), undefined);
});
test('a conflict for Product A never offers rebasing or archive confirmation for Product B', async (t) => {
  const ctx = productsFixture(async (input, options) =>
    String(input).endsWith('/csrf')
      ? csrf()
      : options?.method === 'GET'
        ? json(product)
        : failure(409, 'REVISION_CONFLICT'),
  );
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.products.update(initialEditDraft(product.product));
  const another = {
    ...product,
    product: { ...product.product, id: operationId, name: 'Otro producto' },
    state: { ...product.state, productId: operationId },
  };
  ctx.queries.setQueryData(
    productsKey(productScope(ctx.controller)!, 'detail', operationId),
    another,
  );
  const edit = render(ctx, true, operationId),
    detail = render(ctx, false, operationId);
  assert.ok(edit.includes('Otro producto'));
  assert.ok(
    !edit.includes('Revisar con la versión actual') &&
      !edit.includes('Descartar mis cambios'),
  );
  assert.ok(edit.includes(`/products/${productId}/edit`));
  assert.match(edit, /<button type="submit" disabled=""/);
  assert.match(detail, /disabled=""[^>]*>Archivar producto/);
  assert.throws(() =>
    rebaseDraft(initialEditDraft(another.product), product.product),
  );
});
test('accepted mutation for another route can be acknowledged explicitly without resending', async (t) => {
  let writes = 0;
  const ctx = productsFixture(async (input, options) => {
    if (String(input).endsWith('/csrf')) return csrf();
    writes++;
    return json(result(JSON.parse(String(options?.body))));
  });
  t.after(() => ctx.dispose());
  await ctx.controller.refresh();
  await ctx.products.update(initialEditDraft(product.product));
  ctx.queries.setQueryData(
    productsKey(productScope(ctx.controller)!, 'detail', operationId),
    {
      ...product,
      product: { ...product.product, id: operationId },
      state: { ...product.state, productId: operationId },
    },
  );
  assert.match(render(ctx, true, operationId), /Continuar/);
  ctx.products.acknowledge();
  assert.equal(ctx.products.snapshot().kind, 'READY');
  assert.equal(writes, 1);
});
