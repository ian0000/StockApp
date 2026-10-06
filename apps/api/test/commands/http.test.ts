import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import {
  createSchemaValidator,
  operationReceiptSchema,
} from '@stock-app/contracts';
import { authFixture } from '../auth/helpers.js';
import { purchaseCommand, emptyChanges } from '../helpers/commands.js';
import { id } from '../postgres/helpers.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { createCommandExecutor } from '../../src/infrastructure/postgres/command-executor.js';
import { commandReferences } from '../../src/infrastructure/postgres/command-receipts.js';
import { commandFingerprint } from '../../src/commands/fingerprint.js';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { bootstrapEmptyInventory } from '../../src/ownership/bootstrap.js';
import {
  resolveAuthenticatedUser,
  resolveCloudInventory,
} from '../../src/ownership/context.js';
import { businesses } from '../../src/infrastructure/postgres/schema.js';

test('GET operation receipt enforces real auth, ownership, v7 protocol IDs, security and fail-closed reconstruction', async (t) => {
  let now = Date.now();
  const f = await authFixture(t, {}, () => now);
  const db = createDatabase(f.pool);
  registerOwnershipRoutes(f.app, f.runtime.auth, db);
  async function owner(letter: string) {
    const email = `receipt-${letter}@example.test`;
    await f.signup(email);
    await f.verify(email);
    const { cookie } = await f.signin(email);
    const authenticated = await resolveAuthenticatedUser(f.runtime.auth, {
      cookie,
    });
    const result = await bootstrapEmptyInventory(db, authenticated.user.id, {
      inventoryName: 'Fictional',
      currency: 'USD',
      reportingTimeZone: 'UTC',
    });
    await db
      .update(businesses)
      .set({ cloudAccessEnabled: true })
      .where(eq(businesses.id, result.business.id));
    return {
      cookie,
      context: await resolveCloudInventory(
        db,
        authenticated,
        result.inventory.id,
      ),
    };
  }
  const a = await owner('a'),
    b = await owner('b');
  const legacyInventory = '550e8400-e29b-41d4-a716-446655440001';
  await f.pool.query('UPDATE inventories SET id=$1 WHERE id=$2', [
    legacyInventory,
    a.context.inventory.id,
  ]);
  a.context.inventory.id = legacyInventory;
  const executor = createCommandExecutor(db, () => 2000);
  const accepted = purchaseCommand(),
    conflict = purchaseCommand(),
    rejected = purchaseCommand();
  const base = (command: typeof accepted) => ({
    context: a.context,
    command,
    payloadHash: commandFingerprint(legacyInventory, command),
    requestId: 'original-request',
  });
  const original = await executor({
    ...base(accepted),
    execute: async () => ({
      status: 'ACCEPTED',
      changes: emptyChanges(),
      references: commandReferences(accepted),
    }),
  });
  await executor({
    ...base(conflict),
    execute: async () => ({
      status: 'CONFLICT',
      references: {
        errorCode: 'REVISION_CONFLICT',
        currentRevision: '9007199254740993',
      },
    }),
  });
  await executor({
    ...base(rejected),
    execute: async () => ({
      status: 'REJECTED',
      references: { errorCode: 'VOID_NOT_ELIGIBLE' },
    }),
  });
  const path = (operationId: string, inventoryId = legacyInventory) =>
    `/v1/inventories/${inventoryId}/operations/${operationId}`;
  async function get(url: string, cookie?: string, origin?: string) {
    const response = await f.app.inject({
      url,
      headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) },
    });
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.ok(response.headers['x-request-id']);
    if (response.statusCode >= 400)
      assert.equal(
        response.json().error.requestId,
        response.headers['x-request-id'],
      );
    return response;
  }
  await t.test('anonymous valid path is 401', async () => {
    const response = await get(path(accepted.operationId));
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, 'UNAUTHENTICATED');
  });
  await t.test('disabled cloud and DELETING deny access with 403', async () => {
    for (const value of [
      { cloudAccessEnabled: false },
      { cloudAccessEnabled: true, status: 'DELETING' },
    ]) {
      await db
        .update(businesses)
        .set(value)
        .where(eq(businesses.id, a.context.business.id));
      const response = await get(path(accepted.operationId), a.cookie);
      assert.equal(response.statusCode, 403);
      assert.equal(response.json().error.code, 'CLOUD_ACCESS_DISABLED');
    }
    await db
      .update(businesses)
      .set({ status: 'ACTIVE', cloudAccessEnabled: true })
      .where(eq(businesses.id, a.context.business.id));
  });
  await t.test(
    'own ACCEPTED on legacy v4 Inventory returns original ChangeSet without CSRF',
    async () => {
      const response = await get(
        path(accepted.operationId),
        a.cookie,
        f.config.appOrigin,
      );
      assert.equal(response.statusCode, 200, response.body);
      createSchemaValidator(operationReceiptSchema)(response.json());
      assert.deepEqual(response.json(), original);
      assert.equal(
        response.headers['access-control-allow-origin'],
        f.config.appOrigin,
      );
      assert.equal(
        response.headers['access-control-allow-credentials'],
        'true',
      );
    },
  );
  for (const command of [conflict, rejected])
    await t.test(
      `own terminal ${command.operationId === conflict.operationId ? 'CONFLICT' : 'REJECTED'} uses each HTTP requestId`,
      async () => {
        const first = await get(path(command.operationId), a.cookie),
          second = await get(path(command.operationId), a.cookie);
        assert.equal(first.statusCode, 200);
        createSchemaValidator(operationReceiptSchema)(first.json());
        assert.equal(
          first.json().error.requestId,
          first.headers['x-request-id'],
        );
        assert.equal(
          second.json().error.requestId,
          second.headers['x-request-id'],
        );
        assert.notEqual(
          first.json().error.requestId,
          second.json().error.requestId,
        );
        assert.notEqual(first.json().error.requestId, 'original-request');
        if (command.operationId === conflict.operationId)
          assert.equal(
            first.json().error.details.currentRevision,
            '9007199254740993',
          );
      },
    );
  await t.test(
    'missing and foreign Inventory/receipt all return non-disclosing 404',
    async () => {
      for (const [url, cookie] of [
        [path(id()), a.cookie],
        [path(accepted.operationId), b.cookie],
        [path(accepted.operationId, b.context.inventory.id), b.cookie],
        [path(accepted.operationId, b.context.inventory.id), a.cookie],
      ])
        assert.equal((await get(url, cookie)).statusCode, 404);
    },
  );
  await t.test(
    'malformed Inventory/operation and v4 operation are 400; query allowlist remains strict',
    async () => {
      for (const url of [
        path(accepted.operationId, 'malformed'),
        path('malformed'),
        path(legacyInventory),
        `${path(accepted.operationId)}?ownerUserId=spoof`,
      ]) {
        const response = await get(url, a.cookie);
        assert.equal(response.statusCode, 400);
        assert.equal(response.json().error.code, 'VALIDATION_ERROR');
      }
    },
  );
  await t.test(
    'hostile Origin remains blocked for authenticated GET',
    async () => {
      const response = await get(
        path(accepted.operationId),
        a.cookie,
        'https://evil.example',
      );
      assert.equal(response.statusCode, 403);
      assert.equal(response.json().error.code, 'ORIGIN_NOT_ALLOWED');
      assert.equal(response.headers['access-control-allow-origin'], undefined);
    },
  );
  for (const corruption of [
    'unknown kind',
    'unknown status',
    'extra accepted references',
    'missing ChangeSet',
    'extra changes field',
    'malformed upserts',
    'wrong nested scope',
    'invalid terminal references',
    'missing accepted revision',
    'terminal revision present',
    'nonempty tombstones',
  ] as const) {
    await t.test(
      `corrupt ${corruption} returns sanitized 500 without persisted JSONB`,
      async () => {
        const command = purchaseCommand();
        await executor({
          ...base(command),
          execute: async () => ({
            status: 'ACCEPTED',
            changes: emptyChanges(),
            references: commandReferences(command),
          }),
        });
        const revision = (
          await f.pool.query(
            'SELECT committed_revision FROM operation_receipts WHERE business_id=$1 AND operation_id=$2',
            [a.context.business.id, command.operationId],
          )
        ).rows[0].committed_revision;
        if (corruption === 'missing accepted revision')
          await f.pool.query(
            'UPDATE operation_receipts SET committed_revision=null WHERE operation_id=$1',
            [command.operationId],
          );
        if (corruption === 'terminal revision present')
          await f.pool.query(
            "UPDATE operation_receipts SET result_code='CONFLICT',result_references=$1::jsonb WHERE operation_id=$2",
            [
              JSON.stringify({ errorCode: 'REVISION_CONFLICT' }),
              command.operationId,
            ],
          );
        if (corruption === 'nonempty tombstones')
          await f.pool.query(
            'UPDATE inventory_change_sets SET changes=$1::jsonb WHERE inventory_id=$2 AND revision=$3',
            [
              JSON.stringify({ ...emptyChanges(), tombstones: [{ id: id() }] }),
              legacyInventory,
              revision,
            ],
          );
        if (corruption === 'unknown kind')
          await f.pool.query(
            "UPDATE operation_receipts SET kind='UNKNOWN' WHERE operation_id=$1",
            [command.operationId],
          );
        if (corruption === 'unknown status')
          await f.pool.query(
            "UPDATE operation_receipts SET result_code='DEPENDENCY_BLOCKED' WHERE operation_id=$1",
            [command.operationId],
          );
        if (corruption === 'extra accepted references')
          await f.pool.query(
            'UPDATE operation_receipts SET result_references=$1::jsonb WHERE operation_id=$2',
            [
              JSON.stringify({
                purchaseId: command.payload.purchaseId,
                stack: 'receipt-sensitive-canary',
              }),
              command.operationId,
            ],
          );
        if (corruption === 'missing ChangeSet')
          await f.pool.query(
            'DELETE FROM inventory_change_sets WHERE inventory_id=$1 AND revision=$2',
            [legacyInventory, revision],
          );
        if (corruption === 'extra changes field')
          await f.pool.query(
            'UPDATE inventory_change_sets SET changes=$1::jsonb WHERE inventory_id=$2 AND revision=$3',
            [
              JSON.stringify({
                ...emptyChanges(),
                requestId: 'receipt-sensitive-canary',
              }),
              legacyInventory,
              revision,
            ],
          );
        if (corruption === 'malformed upserts')
          await f.pool.query(
            'UPDATE inventory_change_sets SET changes=$1::jsonb WHERE inventory_id=$2 AND revision=$3',
            [
              JSON.stringify({ upserts: {}, tombstones: [] }),
              legacyInventory,
              revision,
            ],
          );
        if (corruption === 'wrong nested scope') {
          const changes = emptyChanges();
          changes.upserts.inventoryStates.push({
            inventoryId: b.context.inventory.id,
            productId: id(),
            stock: 0,
            unitCost: null,
            stateRevision: '0',
            lastMovementId: null,
          });
          await f.pool.query(
            'UPDATE inventory_change_sets SET changes=$1::jsonb WHERE inventory_id=$2 AND revision=$3',
            [JSON.stringify(changes), legacyInventory, revision],
          );
        }
        if (corruption === 'invalid terminal references')
          await f.pool.query(
            "UPDATE operation_receipts SET result_code='REJECTED',committed_revision=null,result_references=$1::jsonb WHERE operation_id=$2",
            [
              JSON.stringify({
                errorCode: 'INTERNAL_ERROR',
                requestId: 'receipt-sensitive-canary',
              }),
              command.operationId,
            ],
          );
        const response = await get(path(command.operationId), a.cookie);
        assert.equal(response.statusCode, 500);
        assert.equal(response.json().error.code, 'INTERNAL_ERROR');
        assert.doesNotMatch(
          response.body,
          /receipt-sensitive-canary|SELECT|result_references|constraint|stack|postgresql/i,
        );
      },
    );
  }
  await t.test(
    'new receipt read shares durable user read limit and Retry-After',
    async () => {
      now += 60001;
      for (let index = 0; index < 120; index++)
        await f.runtime.auth.security.consume(
          'business-read-user',
          a.context.user.id,
          { window: 60, max: 120 },
        );
      const response = await get(path(accepted.operationId), a.cookie);
      assert.equal(response.statusCode, 429);
      assert.equal(response.json().error.code, 'RATE_LIMITED');
      assert.ok(Number(response.headers['retry-after']) > 0);
    },
  );
  assert.equal((await f.app.inject('/live')).statusCode, 200);
  assert.equal((await f.app.inject('/health')).statusCode, 404);
  assert.equal(
    (
      await f.app.inject({
        method: 'POST',
        url: `/v1/inventories/${legacyInventory}/products`,
        payload: {},
      })
    ).statusCode,
    404,
  );
  assert.doesNotMatch(
    f.logs.join('\n'),
    /receipt-sensitive-canary|result_references|SELECT|password|session_token/i,
  );
});
