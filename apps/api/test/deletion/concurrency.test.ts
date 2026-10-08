import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'drizzle-orm';
import { deletionFixture, suppressionSecret } from './helpers.js';
import { id } from '../postgres/helpers.js';
import {
  createDatabase,
  createPostgresPool,
} from '../../src/infrastructure/postgres/client.js';
import { requestDeletion } from '../../src/deletion/request.js';
import { claimDeletion, advanceDeletion } from '../../src/deletion/worker.js';
import { createCommandExecutor } from '../../src/infrastructure/postgres/command-executor.js';
import { commandFingerprint } from '../../src/commands/fingerprint.js';
import { barrier } from '../helpers/commands.js';
import { purchaseCommand } from '../purchases/helpers.js';
import { saleCommand } from '../sales/helpers.js';
import { adjustmentCommand } from '../adjustments/helpers.js';
import { voidCommand } from '../void-sales/helpers.js';
import { createCommand } from '../products/helpers.js';
import { backupFixture } from '../backup/helpers.js';
import { executeSaleCommand } from '../../src/sales/execute.js';
import { executePurchaseCommand } from '../../src/purchases/execute.js';
import { executeAdjustmentCommand } from '../../src/adjustments/execute.js';
import { executeVoidSaleCommand } from '../../src/void-sales/execute.js';

test('two official HTTP requests with distinct keys and same owner share one durable request', async (t) => {
  const f = await deletionFixture(t),
    a = await f.owner('two-requests'),
    token = await f.csrf(a.cookie);
  const bothStarted = barrier(),
    proceed = barrier(),
    backends = new Set<number>();
  const originalTransaction = f.db.transaction,
    transaction = originalTransaction.bind(f.db);
  // Route auth/CSRF/recency have completed before these two real transactions begin.
  // Hold both callbacks before either can revoke the other request's session.
  f.db.transaction = (callback, config) =>
    transaction(async (tx) => {
      const backend = await tx.execute<{ pid: number }>(
        sql`SELECT pg_backend_pid() AS pid`,
      );
      backends.add(backend.rows[0]!.pid);
      if (backends.size === 2) bothStarted.release();
      await proceed.wait;
      return callback(tx);
    }, config);
  const pending = Promise.all([
    f.request(a.cookie, id(), token),
    f.request(a.cookie, id(), token),
  ]);
  let guard: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      bothStarted.wait,
      new Promise<never>((_resolve, reject) => {
        // Failure guard only, matching the existing per-operation concurrency harness.
        guard = setTimeout(
          () =>
            reject(new Error('Both authenticated transactions did not begin.')),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(guard);
    f.db.transaction = originalTransaction;
    proceed.release();
    await pending;
  }
  const responses = await pending;
  assert.equal(backends.size, 2);
  assert.deepEqual(
    responses.map((r) => r.statusCode),
    [202, 202],
  );
  assert.deepEqual(responses[0]!.json(), responses[1]!.json());
  assert.equal(
    (
      await f.pool.query('SELECT id FROM deletion_requests WHERE user_id=$1', [
        a.authenticated.user.id,
      ])
    ).rowCount,
    1,
  );
});

test('independent runner workers claim exclusively and two owners concurrently colliding on a key get sanitized409', async (t) => {
  let otherPool: ReturnType<typeof createPostgresPool> | undefined;
  t.after(async () => {
    await otherPool?.end();
  });
  const f = await deletionFixture(t),
    a = await f.identity('claim-a'),
    b = await f.identity('claim-b'),
    key = id();
  otherPool = createPostgresPool(f.pool.options.connectionString!);
  const other = createDatabase(otherPool);
  const results = await Promise.allSettled([
    requestDeletion(f.db, {
      userId: a.authenticated.user.id,
      key,
      secret: suppressionSecret,
    }),
    requestDeletion(other, {
      userId: b.authenticated.user.id,
      key,
      secret: suppressionSecret,
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.equal(rejected.reason.code, 'IDEMPOTENCY_KEY_REUSED');
  const claims = await Promise.all([claimDeletion(f.db), claimDeletion(other)]);
  assert.equal(claims.filter(Boolean).length, 1);
  const claim = claims.find((c) => c !== null);
  assert.ok(claim);
  while ((await advanceDeletion(other, claim, f.keys)) === 'continue') {
    /* Independent worker pool. */
  }
});

test('Inventory lock serializes deletion after each commercial command and later stale contexts cannot write', async (t) => {
  for (const kind of ['sale', 'purchase', 'adjustment', 'void'] as const)
    await t.test(kind, async (t) => {
      let pool: ReturnType<typeof createPostgresPool> | undefined;
      t.after(async () => {
        await pool?.end();
      });
      const f = await deletionFixture(t),
        a = await f.owner(`race-${kind}`),
        key = id();
      const product = createCommand({
        initialStock: 5,
        initialUnitCost: '1000000',
        initialMovementId: id(),
      });
      await f.run(a.context, product);
      let command;
      if (kind === 'sale')
        command = saleCommand([
          {
            productId: product.payload.productId,
            quantity: 1,
            price: '2000000',
            cost: '1000000',
            estimatedCost: '1000000',
            estimatedProfit: '1000000',
          },
        ]);
      else if (kind === 'purchase')
        command = purchaseCommand(
          product.payload.productId,
          1,
          '1000000',
          await f.state(a.context, product.payload.productId),
        );
      else if (kind === 'adjustment')
        command = adjustmentCommand(
          product.payload.productId,
          4,
          null,
          null,
          await f.state(a.context, product.payload.productId),
        );
      else {
        const sale = saleCommand([
          {
            productId: product.payload.productId,
            quantity: 1,
            price: '2000000',
            cost: '1000000',
            estimatedCost: '1000000',
            estimatedProfit: '1000000',
          },
        ]);
        sale.occurredAt = 900;
        sale.payload.createdAt = 1000;
        await f.run(a.context, sale);
        command = voidCommand(sale.payload.saleId, [
          {
            productId: product.payload.productId,
            ...(await f.state(a.context, product.payload.productId)),
          },
        ]);
      }
      pool = createPostgresPool(f.pool.options.connectionString!);
      const lockedCommand = barrier(),
        releaseCommand = barrier();
      const execute = createCommandExecutor(createDatabase(pool));
      const commandResult = execute({
        context: a.context,
        command,
        payloadHash: commandFingerprint(a.context.inventory.id, command),
        requestId: 'deletion-race',
        execute: async (tx, inventory) => {
          lockedCommand.release();
          await releaseCommand.wait;
          switch (command.commandKind) {
            case 'SALE_REGISTER':
              return executeSaleCommand(tx, inventory.id, command);
            case 'PURCHASE_REGISTER':
              return executePurchaseCommand(tx, inventory.id, command);
            case 'STOCK_ADJUST':
              return executeAdjustmentCommand(tx, inventory.id, command);
            case 'SALE_VOID':
              return executeVoidSaleCommand(tx, inventory.id, command);
          }
        },
      });
      await lockedCommand.wait;
      const deletion = requestDeletion(f.db, {
        userId: a.authenticated.user.id,
        key,
        secret: suppressionSecret,
      });
      // Observe the actual PG lock wait, not elapsed sleeps, before allowing the earlier command.
      let locked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const observed = await pool.query(
          "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%inventories%' AND pid<>pg_backend_pid()",
        );
        if (observed.rowCount) {
          locked = true;
          break;
        }
      }
      releaseCommand.release();
      assert.equal(locked, true);
      assert.equal((await commandResult).status, 'ACCEPTED');
      // Deletion already queued owns the boundary; the pre-resolved financial context cannot bypass it.
      await deletion;
      const before = (
        await f.pool.query('SELECT revision FROM inventories WHERE id=$1', [
          a.context.inventory.id,
        ])
      ).rows[0].revision;
      await assert.rejects(f.run(a.context, command), {
        code: 'CLOUD_ACCESS_DISABLED',
      });
      assert.equal(
        (
          await f.pool.query('SELECT revision FROM inventories WHERE id=$1', [
            a.context.inventory.id,
          ])
        ).rows[0].revision,
        before,
      );
    });
});

test('in-flight export and backup revalidate revoked session after atomic deletion; valid session DELETING remains403', async (t) => {
  let revoke: (() => Promise<void>) | undefined;
  const f = await backupFixture(t, async (snapshot) => {
    await revoke?.();
    return snapshot;
  });
  const a = await f.owner('export-race');
  revoke = async () => {
    await requestDeletion(f.db, {
      userId: a.authenticated.user.id,
      key: id(),
      secret: suppressionSecret,
    });
  };
  const response = await f.app.inject({
    url: '/v1/me/export',
    headers: { cookie: a.cookie },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'UNAUTHENTICATED');
  assert.doesNotMatch(response.body, /stockapp-backup|exportedAt/);
  const fresh = await f.signin(a.email);
  f.setClock(Date.now());
  const denied = await f.app.inject({
    url: '/v1/me/export',
    headers: { cookie: fresh.cookie },
  });
  assert.equal(denied.statusCode, 403);
  const b = await f.owner('backup-race');
  revoke = async () => {
    await requestDeletion(f.db, {
      userId: b.authenticated.user.id,
      key: id(),
      secret: suppressionSecret,
    });
  };
  const backup = await f.app.inject({
    url: `/v1/inventories/${b.context.inventory.id}/backup`,
    headers: { cookie: b.cookie },
  });
  assert.equal(backup.statusCode, 401);
  assert.doesNotMatch(backup.body, /stockapp-backup/);
});
