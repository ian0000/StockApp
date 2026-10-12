import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contractSchemas, createSchemaValidator } from '@stock-app/contracts';
import {
  buildVoid,
  eligibilityMessage,
  operation,
  type VoidKind,
} from '../src/voids/input.js';
import {
  coherentVoid,
  recoverVoid,
  createVoidsClient,
} from '../src/voids/client.js';
import { createApiClient, ApiClientError } from '../src/api/client.js';
import {
  voidReview,
  voidResult,
  voidReceipt,
  legacyOperationId,
} from './void-fixtures.js';
import {
  json,
  failure,
  inventoryId,
  operationId,
  product,
} from './product-fixtures.js';
const kinds: VoidKind[] = ['SALE_VOID', 'PURCHASE_VOID'];
for (const kind of kinds)
  for (const cost of [null, '0', '1000000'])
    test(`${kind} legacy entities/v7 new IDs, exact revision/null/zero and immutable snapshots ${cost}`, () => {
      const review = voidReview(kind, cost, kind === 'SALE_VOID'),
        before = structuredClone(review),
        command = buildVoid(review, 1000);
      createSchemaValidator(
        kind === 'SALE_VOID'
          ? contractSchemas.VoidSaleCommand
          : contractSchemas.VoidPurchaseCommand,
      )(command);
      createSchemaValidator(contractSchemas.UUIDv7)(command.operationId);
      assert.equal(command.occurredAt, command.payload.createdAt);
      assert.deepEqual(command.dependsOn, []);
      assert.equal(operation(review).id, legacyOperationId);
      if (command.commandKind === 'SALE_VOID') {
        assert.equal(command.preconditions.states.length, 2);
        for (const m of command.payload.reversalMovements)
          createSchemaValidator(contractSchemas.UUIDv7)(m.movementId);
        assert.equal(
          command.preconditions.states[0]!.expectedState.unitCost,
          cost,
        );
        assert.equal(
          command.preconditions.states[0]!.expectedStateRevision,
          '9007199254740993',
        );
      } else {
        createSchemaValidator(contractSchemas.UUIDv7)(
          command.payload.reversalMovementId,
        );
        assert.deepEqual(Object.keys(command.payload).sort(), [
          'createdAt',
          'purchaseId',
          'reversalMovementId',
        ]);
        assert.equal(
          command.preconditions.expectedStateRevision,
          '9007199254740993',
        );
      }
      const result = voidResult(command, review);
      createSchemaValidator(
        kind === 'SALE_VOID'
          ? contractSchemas.VoidSaleResult
          : contractSchemas.VoidPurchaseResult,
      )(result);
      assert.equal(coherentVoid(result, inventoryId, command, review), true);
      assert.deepEqual(
        recoverVoid(
          voidReceipt(command, review),
          inventoryId,
          kind,
          command,
          review,
        ),
        result,
      );
      assert.deepEqual(review, before);
      if ('purchase' in result) {
        assert.equal(result.states[0]!.stock, -3);
        assert.equal(result.states[0]!.unitCost, cost);
      }
    });
for (const kind of kinds)
  for (const defect of [
    'not-eligible',
    'voided',
    'missing-state',
    'duplicate-state',
    'foreign-state',
    'extra-state',
  ])
    test(`${kind} cannot build with ${defect}`, () => {
      const r = voidReview(kind, null);
      if (defect === 'not-eligible') r.detail.voidEligibility.eligible = false;
      if (defect === 'voided') operation(r).status = 'VOIDED';
      if (defect === 'missing-state') r.states = [];
      if (defect === 'duplicate-state') r.states.push(r.states[0]!);
      if (defect === 'foreign-state') r.states[0]!.inventoryId = operationId;
      if (defect === 'extra-state')
        r.states.push({ ...r.states[0]!, productId: operationId });
      assert.throws(() => buildVoid(r));
    });
for (const kind of kinds)
  for (const reason of [
    'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT',
    'CURRENT_STATE_MISMATCH',
  ] as const)
    test(`${kind} eligibility explanation ${reason} is plain and authoritative`, () => {
      const r = voidReview(kind);
      r.detail.voidEligibility = { eligible: false, reason };
      assert.match(
        eligibilityMessage(r),
        reason.startsWith('SUBSEQUENT')
          ? /posteriores.*inequívoco/
          : /estado actual.*no coincide/,
      );
      assert.doesNotMatch(eligibilityMessage(r), /revision|SQL/i);
    });
for (const kind of kinds)
  for (const defect of [
    'kind',
    'status',
    'scope',
    'reversal-type',
    'reversal-link',
    'state-pointer',
    'state-stock',
    'duplicate-movement',
    'missing-state',
    'snapshot',
    'revision',
  ])
    test(`${kind} malformed accepted response ${defect} remains uncertain`, async () => {
      const review = voidReview(kind, null, kind === 'SALE_VOID'),
        command = buildVoid(review, 1000),
        r = voidResult(command, review);
      if (defect === 'kind') r.kind = 'ALREADY_VOIDED';
      if (defect === 'status')
        ('sale' in r ? r.sale : r.purchase).status = 'CONFIRMED';
      if (defect === 'scope') r.states[0]!.inventoryId = operationId;
      if (defect === 'reversal-type') r.reversals[0]!.type = 'PURCHASE';
      if (defect === 'reversal-link') r.reversals[0]!.sourceId = operationId;
      if (defect === 'state-pointer') r.states[0]!.lastMovementId = operationId;
      if (defect === 'state-stock') r.states[0]!.stock++;
      if (defect === 'duplicate-movement') r.reversals.push(r.reversals[0]!);
      if (defect === 'missing-state') r.states = [];
      if (defect === 'snapshot')
        ('sale' in r ? r.sale : r.purchase).totalAmount = '1';
      if (defect === 'revision')
        r.states[0]!.stateRevision = '9007199254740993';
      const client = createVoidsClient(
        createApiClient({
          baseUrl: 'https://api.example.test',
          fetcher: async (input) =>
            String(input).endsWith('/csrf')
              ? json({ token: 'token' })
              : json(r),
        }),
      );
      await assert.rejects(
        client.send(
          inventoryId,
          command,
          review,
          new AbortController().signal,
          () => {},
        ),
        ApiClientError,
      );
    });
for (const kind of kinds)
  test(`${kind} POST uses exact path/body, CSRF, operation key and no hidden register`, async () => {
    const r = voidReview(kind),
      command = buildVoid(r);
    let writes = 0;
    const client = createVoidsClient(
      createApiClient({
        baseUrl: 'https://api.example.test',
        fetcher: async (input, options) => {
          if (String(input).endsWith('/csrf')) return json({ token: 'token' });
          writes++;
          assert.ok(
            String(input).endsWith(
              `/${kind === 'SALE_VOID' ? 'sales' : 'purchases'}/${legacyOperationId}/void`,
            ),
          );
          assert.deepEqual(JSON.parse(String(options?.body)), command);
          const h = new Headers(options?.headers);
          assert.equal(h.get('X-CSRF-Token'), 'token');
          assert.equal(h.get('Idempotency-Key'), command.operationId);
          assert.equal(options?.cache, 'no-store');
          assert.equal(options?.credentials, 'include');
          return json(voidResult(command, r));
        },
      }),
    );
    await client.send(
      inventoryId,
      command,
      r,
      new AbortController().signal,
      () => {},
    );
    assert.equal(writes, 1);
  });
for (const defect of [
  'foreign',
  'wrong-product',
  'missing-revision',
  'revision-number',
  'extra-field',
])
  test(`State GET rejects ${defect} without using old receipts or Product metadata`, async () => {
    const r = voidReview('SALE_VOID'),
      state: Record<string, unknown> = { ...r.states[0]! };
    if (defect === 'foreign') state.inventoryId = operationId;
    if (defect === 'wrong-product') state.productId = operationId;
    if (defect === 'missing-revision') delete state.stateRevision;
    if (defect === 'revision-number') state.stateRevision = 9007199254740992;
    if (defect === 'extra-field') state.productName = 'PRIVATE';
    const client = createVoidsClient(
      createApiClient({
        baseUrl: 'https://api.example.test',
        fetcher: async (input, options) => {
          assert.ok(
            String(input).endsWith(`/products/${r.states[0]!.productId}/state`),
          );
          assert.equal(options?.method, 'GET');
          assert.equal(options?.body, undefined);
          assert.equal(new Headers(options?.headers).get('X-CSRF-Token'), null);
          return json(state);
        },
      }),
    );
    await assert.rejects(
      client.state(
        inventoryId,
        r.states[0]!.productId,
        new AbortController().signal,
      ),
      ApiClientError,
    );
  });
for (const kind of kinds)
  for (const status of [404, 401, 403, 429, 500])
    test(`${kind} own detail safe HTTP ${status}`, async () => {
      const client = createVoidsClient(
        createApiClient({
          baseUrl: 'https://api.example.test',
          fetcher: async () =>
            failure(
              status,
              status === 404
                ? 'NOT_FOUND'
                : status === 401
                  ? 'UNAUTHENTICATED'
                  : status === 403
                    ? 'CLOUD_ACCESS_DISABLED'
                    : status === 429
                      ? 'RATE_LIMITED'
                      : 'INTERNAL_ERROR',
            ),
        }),
      );
      if (status === 404)
        assert.equal(
          await client.detail(
            inventoryId,
            kind,
            legacyOperationId,
            new AbortController().signal,
          ),
          null,
        );
      else
        await assert.rejects(
          client.detail(
            inventoryId,
            kind,
            legacyOperationId,
            new AbortController().signal,
          ),
          ApiClientError,
        );
    });
for (const kind of kinds)
  for (const defect of [
    'foreign',
    'extra-product',
    'fake-items',
    'missing-reversal',
    'wrong-pointer',
    'not-voided',
    'private-references',
  ])
    test(`${kind} reload receipt ${defect} cannot fabricate acceptance`, () => {
      const r = voidReview(kind),
        c = buildVoid(r),
        receipt = voidReceipt(c, r),
        u = receipt.changeSet.upserts;
      if (defect === 'foreign') receipt.changeSet.inventoryId = operationId;
      if (defect === 'extra-product') u.products = [product.product];
      if (defect === 'fake-items') {
        const sale = voidReview('SALE_VOID');
        assert.equal(sale.commandKind, 'SALE_VOID');
        if (sale.commandKind === 'SALE_VOID') u.saleItems = sale.detail.items;
      }
      if (defect === 'missing-reversal') u.inventoryMovements = [];
      if (defect === 'wrong-pointer')
        u.inventoryStates[0]!.lastMovementId = operationId;
      if (defect === 'not-voided')
        (kind === 'SALE_VOID' ? u.sales[0]! : u.purchases[0]!).status =
          'CONFIRMED';
      const hostile: unknown =
        defect === 'private-references'
          ? { ...receipt, resultReferences: { saleId: legacyOperationId } }
          : receipt;
      const validate = createSchemaValidator(contractSchemas.OperationReceipt);
      if (defect === 'private-references')
        assert.throws(() => validate(hostile));
      else
        assert.throws(
          () => recoverVoid(receipt, inventoryId, kind),
          ApiClientError,
        );
    });
