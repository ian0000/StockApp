import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryObserver, InfiniteQueryObserver } from '@tanstack/react-query';
import type { CommandEnvelopeV1, OperationReceipt } from '@stock-app/contracts';
import { contractSchemas, createSchemaValidator } from '@stock-app/contracts';
import { createApiClient } from '../src/api/client.js';
import { createReadsClient } from '../src/reads/client.js';
import {
  dashboardOptions,
  historyOptions,
  dashboardKey,
  historyKey,
} from '../src/reads/queries.js';
import { commandScope } from '../src/commands/scope.js';
import {
  initialProductForm,
  buildProductCommand,
} from '../src/products/input.js';
import {
  initialEditDraft,
  buildUpdateCommand,
  buildArchiveCommand,
} from '../src/products/edit.js';
import { SalesController, PENDING_SALE_KEY } from '../src/sales/controller.js';
import { createSalesClient } from '../src/sales/client.js';
import { prepareSale } from '../src/sales/cart.js';
import {
  PurchasesController,
  PENDING_PURCHASE_KEY,
} from '../src/purchases/controller.js';
import { createPurchasesClient } from '../src/purchases/client.js';
import { buildPurchase } from '../src/purchases/input.js';
import {
  AdjustmentsController,
  PENDING_ADJUSTMENT_KEY,
} from '../src/adjustments/controller.js';
import { createAdjustmentsClient } from '../src/adjustments/client.js';
import { buildAdjustment } from '../src/adjustments/input.js';
import { PENDING_PRODUCT_KEY } from '../src/products/pending.js';
import {
  product,
  productsFixture,
  inventoryId,
  strictResult,
  json,
  failure,
} from './product-fixtures.js';
import {
  saleProduct,
  initialCart,
  saleResult,
  saleReceipt,
} from './sale-fixtures.js';
import {
  purchaseProduct,
  purchaseForm,
  purchaseResult,
  purchaseReceipt,
} from './purchase-fixtures.js';
import {
  adjustmentProduct,
  adjustmentForm,
  adjustmentResult,
  adjustmentReceipt,
} from './adjustment-fixtures.js';
import { deferred } from './session-fixtures.js';
import { dashboard, historyEntries } from './read-fixtures.js';
const kinds = [
  'PRODUCT_CREATE',
  'PRODUCT_UPDATE',
  'PRODUCT_ARCHIVE',
  'SALE_REGISTER',
  'PURCHASE_REGISTER',
  'STOCK_ADJUST',
] as const;
type Kind = (typeof kinds)[number];
function assertCommand(value: unknown): asserts value is CommandEnvelopeV1 {
  createSchemaValidator(contractSchemas.CommandEnvelope)(value);
}
function seedCommand(kind: Kind) {
  switch (kind) {
    case 'PRODUCT_CREATE':
      return buildProductCommand({
        ...initialProductForm(),
        name: 'Nuevo',
        regularSalePrice: '1',
      });
    case 'PRODUCT_UPDATE':
      return buildUpdateCommand(initialEditDraft(product.product));
    case 'PRODUCT_ARCHIVE':
      return buildArchiveCommand(product.product);
    case 'SALE_REGISTER':
      return prepareSale(initialCart(), [saleProduct]).command;
    case 'PURCHASE_REGISTER':
      return buildPurchase(purchaseForm(), purchaseProduct);
    case 'STOCK_ADJUST':
      return buildAdjustment(adjustmentForm(), adjustmentProduct);
  }
}
function result(command: CommandEnvelopeV1) {
  switch (command.commandKind) {
    case 'PRODUCT_CREATE':
      return strictResult(command);
    case 'PRODUCT_UPDATE':
      return {
        product: {
          ...product.product,
          name: command.payload.name,
          variant: command.payload.variant,
          barcode: command.payload.barcode,
          regularSalePrice: command.payload.regularSalePrice,
          minimumStock: command.payload.minimumStock,
          metadataRevision: '1',
        },
        committedRevision: '1',
        serverRecordedAt: command.occurredAt,
      };
    case 'PRODUCT_ARCHIVE':
      return {
        product: {
          ...product.product,
          isArchived: true,
          metadataRevision: '1',
        },
        committedRevision: '1',
        serverRecordedAt: command.occurredAt,
      };
    case 'SALE_REGISTER':
      return saleResult(command);
    case 'PURCHASE_REGISTER':
      return purchaseResult(command);
    case 'STOCK_ADJUST':
      return adjustmentResult(command);
    default:
      throw new Error('Outside WEB-08 scenario');
  }
}
function receiptFor(command: CommandEnvelopeV1): OperationReceipt {
  switch (command.commandKind) {
    case 'SALE_REGISTER':
      return saleReceipt(command);
    case 'PURCHASE_REGISTER':
      return purchaseReceipt(command);
    case 'STOCK_ADJUST':
      return adjustmentReceipt(command);
    case 'PRODUCT_CREATE':
    case 'PRODUCT_UPDATE':
    case 'PRODUCT_ARCHIVE': {
      const r =
        command.commandKind === 'PRODUCT_CREATE'
          ? strictResult(command)
          : {
              product: {
                ...product.product,
                isArchived: command.commandKind === 'PRODUCT_ARCHIVE',
              },
            };
      return {
        operationId: command.operationId,
        status: 'ACCEPTED',
        changeSet: {
          inventoryId,
          revision: '1',
          serverRecordedAt: 1,
          upserts: {
            products: [r.product],
            inventoryStates: [],
            sales: [],
            saleItems: [],
            purchases: [],
            stockAdjustments: [],
            inventoryMovements: [],
          },
          tombstones: [],
        },
      };
    }
    default:
      throw new Error('Outside WEB-08 scenario');
  }
}
function scenario(kind: Kind, recovery = false) {
  const seeded = seedCommand(kind),
    gate = deferred<Response>(),
    started = deferred<void>();
  let version = 0,
    saved: CommandEnvelopeV1 = seeded,
    posts = 0,
    dashboards = 0,
    histories = 0;
  let retryReply: Response | undefined;
  const writes: { body: string; key: string | null }[] = [];
  const key = kind.startsWith('PRODUCT_')
    ? PENDING_PRODUCT_KEY
    : kind === 'SALE_REGISTER'
      ? PENDING_SALE_KEY
      : kind === 'PURCHASE_REGISTER'
        ? PENDING_PURCHASE_KEY
        : PENDING_ADJUSTMENT_KEY;
  const stored = JSON.stringify({
    operationId: seeded.operationId,
    inventoryId,
    commandKind: kind,
  });
  const fetcher: typeof fetch = async (input, options) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/dashboard')) {
      dashboards++;
      return json({
        ...dashboard,
        sales: { ...dashboard.sales, unitsSold: version ? 8 : 7 },
      });
    }
    if (path.endsWith('/history')) {
      histories++;
      return json({
        items: version ? historyEntries.slice(0, 2) : historyEntries,
        nextCursor: null,
      });
    }
    if (path.endsWith('/csrf')) return json({ token: 'csrf' });
    if (path.includes('/operations/')) {
      started.resolve();
      return gate.promise;
    }
    if (options?.body) {
      const body: unknown = JSON.parse(String(options.body));
      assertCommand(body);
      saved = body;
      posts++;
      writes.push({
        body: String(options.body),
        key: new Headers(options.headers).get('Idempotency-Key'),
      });
      started.resolve();
      return retryReply ?? gate.promise;
    }
    return json(
      kind === 'SALE_REGISTER'
        ? saleProduct
        : kind === 'PURCHASE_REGISTER'
          ? purchaseProduct
          : adjustmentProduct,
    );
  };
  const f = productsFixture(
    fetcher,
    recovery && kind.startsWith('PRODUCT_') ? stored : undefined,
  );
  if (recovery && !kind.startsWith('PRODUCT_')) f.storage.setItem(key, stored);
  const api = createApiClient({ baseUrl: 'https://api.example.test', fetcher });
  const sales = new SalesController(
    createSalesClient(api),
    f.client,
    f.controller,
    f.queries,
    f.storage,
    () => true,
  );
  const purchases = new PurchasesController(
    createPurchasesClient(api),
    f.products,
    f.controller,
    f.queries,
    f.storage,
    () => true,
  );
  const adjustments = new AdjustmentsController(
    createAdjustmentsClient(api),
    f.products,
    f.controller,
    f.queries,
    f.storage,
    () => true,
  );
  const target = kind.startsWith('PRODUCT_')
    ? f.products
    : kind === 'SALE_REGISTER'
      ? sales
      : kind === 'PURCHASE_REGISTER'
        ? purchases
        : adjustments;
  return {
    ...f,
    target,
    gate,
    started,
    reads: createReadsClient(api),
    saved: () => saved,
    readsCount: () => [dashboards, histories],
    posts: () => posts,
    writes,
    replyOnRetry(response: Response) {
      retryReply = response;
    },
    nextVersion() {
      version = 1;
    },
    async submit() {
      switch (kind) {
        case 'PRODUCT_CREATE':
          return f.products.submit({
            ...initialProductForm(),
            name: 'Nuevo',
            regularSalePrice: '1',
          });
        case 'PRODUCT_UPDATE':
          return f.products.update(initialEditDraft(product.product));
        case 'PRODUCT_ARCHIVE':
          return f.products.archive(product.product);
        case 'SALE_REGISTER':
          return sales.prepare(initialCart());
        case 'PURCHASE_REGISTER':
          return purchases.prepare(purchaseForm());
        case 'STOCK_ADJUST':
          await adjustments.prepare(adjustmentForm());
          return adjustments.confirm();
      }
    },
    dispose() {
      sales.dispose();
      purchases.dispose();
      adjustments.dispose();
      f.dispose();
    },
  };
}
for (const kind of kinds)
  for (const recovery of [false, true])
    test(`${kind} ${recovery ? 'reload receipt' : 'direct acceptance'} refreshes own Dashboard and History through accepted lifecycle`, async (t) => {
      const f = scenario(kind, recovery);
      t.after(() => f.dispose());
      await f.controller.refresh();
      const scope = commandScope(f.controller)!;
      const d = new QueryObserver(f.queries, dashboardOptions(f.reads, scope)),
        h = new InfiniteQueryObserver(
          f.queries,
          historyOptions(f.reads, scope),
        );
      const stopD = d.subscribe(() => {}),
        stopH = h.subscribe(() => {});
      t.after(() => {
        stopD();
        stopH();
      });
      await d.refetch();
      await h.refetch();
      const other = { ...scope, inventoryId: historyEntries[0]!.id };
      f.queries.setQueryData(dashboardKey(other), dashboard);
      f.queries.setQueryData(historyKey(other), {
        pages: [{ items: historyEntries, nextCursor: null }],
        pageParams: [null],
      });
      const sending = recovery ? Promise.resolve() : f.submit();
      await f.started.promise;
      const before = f.readsCount();
      assert.equal(d.getCurrentResult().data!.sales.unitsSold, 7);
      assert.equal(h.getCurrentResult().data!.pages[0]!.items.length, 3);
      f.nextVersion();
      f.gate.resolve(
        json(recovery ? receiptFor(f.saved()) : result(f.saved())),
      );
      await sending;
      if (recovery)
        await new Promise<void>((resolve) => {
          if (f.target.snapshot().kind === 'ACCEPTED') return resolve();
          const stop = f.target.subscribe(() => {
            if (f.target.snapshot().kind === 'ACCEPTED') {
              stop();
              resolve();
            }
          });
        });
      assert.equal(f.target.snapshot().kind, 'ACCEPTED');
      assert.equal(d.getCurrentResult().data!.sales.unitsSold, 8);
      assert.equal(h.getCurrentResult().data!.pages[0]!.items.length, 2);
      assert.deepEqual(
        f.readsCount(),
        before.map((n) => n + 1),
      );
      assert.equal(f.posts(), recovery ? 0 : 1);
      assert.equal(
        f.queries.getQueryState(dashboardKey(other))!.isInvalidated,
        false,
      );
      assert.equal(
        f.queries.getQueryState(historyKey(other))!.isInvalidated,
        false,
      );
    });
for (const kind of kinds)
  test(`${kind} lost ACK then same-operation retry refreshes reads once after durable acceptance`, async (t) => {
    const f = scenario(kind);
    t.after(() => f.dispose());
    await f.controller.refresh();
    const scope = commandScope(f.controller)!;
    const d = new QueryObserver(f.queries, dashboardOptions(f.reads, scope)),
      h = new InfiniteQueryObserver(f.queries, historyOptions(f.reads, scope));
    const stopD = d.subscribe(() => {}),
      stopH = h.subscribe(() => {});
    t.after(() => {
      stopD();
      stopH();
    });
    await d.refetch();
    await h.refetch();
    const sending = f.submit();
    await f.started.promise;
    const before = f.readsCount();
    f.gate.resolve(new Response('ACK lost', { status: 503 }));
    await sending;
    assert.equal(f.target.snapshot().kind, 'UNCERTAIN');
    assert.deepEqual(f.readsCount(), before);
    assert.equal(d.getCurrentResult().data!.sales.unitsSold, 7);
    f.nextVersion();
    f.replyOnRetry(json(result(f.saved())));
    await f.target.retry();
    assert.equal(f.target.snapshot().kind, 'ACCEPTED');
    assert.equal(f.posts(), 2);
    assert.deepEqual(f.writes[0], f.writes[1]);
    assert.deepEqual(
      f.readsCount(),
      before.map((n) => n + 1),
    );
    assert.equal(d.getCurrentResult().data!.sales.unitsSold, 8);
  });
for (const kind of kinds)
  for (const outcome of ['uncertain', 'conflict', 'rejected'] as const)
    test(`${kind} ${outcome} never invalidates Home/History or fabricates cache entries`, async (t) => {
      const f = scenario(kind);
      t.after(() => f.dispose());
      await f.controller.refresh();
      const scope = commandScope(f.controller)!;
      f.queries.setQueryData(dashboardKey(scope), dashboard);
      f.queries.setQueryData(historyKey(scope), {
        pages: [{ items: historyEntries, nextCursor: null }],
        pageParams: [null],
      });
      const sending = f.submit();
      await f.started.promise;
      assert.equal(
        f.queries.getQueryState(dashboardKey(scope))!.isInvalidated,
        false,
      );
      f.gate.resolve(
        outcome === 'uncertain'
          ? new Response('lost', { status: 503 })
          : failure(
              outcome === 'conflict' ? 409 : 422,
              outcome === 'conflict' ? 'REVISION_CONFLICT' : 'DOMAIN_RULE',
            ),
      );
      await sending;
      assert.equal(
        f.queries.getQueryState(dashboardKey(scope))!.isInvalidated,
        false,
      );
      assert.equal(
        f.queries.getQueryState(historyKey(scope))!.isInvalidated,
        false,
      );
      assert.deepEqual(f.queries.getQueryData(dashboardKey(scope)), dashboard);
      assert.equal(f.posts(), 1);
    });
