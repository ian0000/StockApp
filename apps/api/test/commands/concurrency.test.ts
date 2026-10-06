import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import {
  createDatabase,
  createPostgresPool,
} from '../../src/infrastructure/postgres/client.js';
import { createCommandExecutor } from '../../src/infrastructure/postgres/command-executor.js';
import { commandReferences } from '../../src/infrastructure/postgres/command-receipts.js';
import { CommandError } from '../../src/commands/errors.js';
import { OwnershipError } from '../../src/ownership/errors.js';
import { inventories } from '../../src/infrastructure/postgres/schema.js';
import { barrier, emptyChanges, purchaseCommand } from '../helpers/commands.js';
import { engineFixture, waitForInventoryLock } from './helpers.js';

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Independent operation did not complete.')),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test('independent PostgreSQL connections enforce Inventory ordering and durable concurrent idempotency', async (t) => {
  let poolB: ReturnType<typeof createPostgresPool> | undefined;
  // Close the independent pool before the fixture's earlier database-drop hook runs.
  t.after(async () => {
    await poolB?.end();
  });
  const f = await engineFixture(t);
  assert.ok(f.pool.options.connectionString);
  poolB = createPostgresPool(f.pool.options.connectionString);
  const executeB = createCommandExecutor(createDatabase(poolB), () => 2000);
  await t.test(
    'same operation/hash concurrent retry executes exactly once after the actual row lock wait',
    async () => {
      const context = await f.dataset(),
        command = purchaseCommand();
      const entered = barrier(),
        release = barrier();
      let calls = 0;
      const input = f.input(context, command, async () => {
        calls++;
        entered.release();
        await release.wait;
        return {
          status: 'ACCEPTED',
          changes: emptyChanges(),
          references: commandReferences(command),
        };
      });
      const first = f.execute(input);
      await entered.wait;
      const second = executeB(input);
      try {
        await waitForInventoryLock(f.pool);
        assert.equal(calls, 1);
      } finally {
        release.release();
      }
      const [a, b] = await Promise.all([first, second]);
      assert.deepEqual(a, b);
      assert.equal(calls, 1);
      assert.deepEqual(await f.counts(context), {
        revision: '1',
        receipts: '1',
        changes: '1',
        name: context.inventory.name,
      });
    },
  );
  await t.test(
    'concurrent different hash has one winner and one sanitized semantic 409',
    async () => {
      const context = await f.dataset(),
        command = purchaseCommand();
      const entered = barrier(),
        release = barrier();
      const first = f.execute(
        f.input(context, command, async () => {
          entered.release();
          await release.wait;
          return {
            status: 'ACCEPTED',
            changes: emptyChanges(),
            references: commandReferences(command),
          };
        }),
      );
      await entered.wait;
      const second = executeB(
        f.input(
          context,
          { ...command, payload: { ...command.payload, quantity: 2 } },
          async () => {
            assert.fail('Losing callback must not run.');
          },
        ),
      ).then(
        () => assert.fail('Expected mismatched intent.'),
        (error: unknown) => error,
      );
      try {
        await waitForInventoryLock(f.pool);
      } finally {
        release.release();
      }
      await first;
      const error = await second;
      assert.ok(error instanceof CommandError);
      assert.equal(error.code, 'IDEMPOTENCY_KEY_REUSED');
      assert.equal(error.statusCode, 409);
      assert.equal((await f.counts(context)).revision, '1');
      assert.equal((await f.counts(context)).receipts, '1');
    },
  );
  await t.test(
    'two distinct accepted commands cannot enter together and commit revisions 6 then 7',
    async () => {
      const context = await f.dataset(),
        a = purchaseCommand(),
        b = purchaseCommand();
      await f.db
        .update(inventories)
        .set({ revision: 5n })
        .where(eq(inventories.id, context.inventory.id));
      const entered = barrier(),
        release = barrier();
      let bEntered = false;
      const first = f.execute(
        f.input(context, a, async () => {
          entered.release();
          await release.wait;
          return {
            status: 'ACCEPTED',
            changes: emptyChanges(),
            references: commandReferences(a),
          };
        }),
      );
      await entered.wait;
      const second = executeB(
        f.input(context, b, async () => {
          bEntered = true;
          return {
            status: 'ACCEPTED',
            changes: emptyChanges(),
            references: commandReferences(b),
          };
        }),
      );
      try {
        await waitForInventoryLock(f.pool);
        assert.equal(bEntered, false);
      } finally {
        release.release();
      }
      const [firstResult, secondResult] = await Promise.all([first, second]);
      if (
        firstResult.status !== 'ACCEPTED' ||
        secondResult.status !== 'ACCEPTED'
      )
        assert.fail('Expected accepted pair.');
      assert.equal(firstResult.changeSet.revision, '6');
      assert.equal(secondResult.changeSet.revision, '7');
      assert.deepEqual(await f.counts(context), {
        revision: '7',
        receipts: '2',
        changes: '2',
        name: context.inventory.name,
      });
    },
  );
  await t.test(
    'waiting command after aborted callback receives revision 11 without an aborted gap',
    async () => {
      const context = await f.dataset(),
        a = purchaseCommand(),
        b = purchaseCommand();
      await f.db
        .update(inventories)
        .set({ revision: 10n })
        .where(eq(inventories.id, context.inventory.id));
      const entered = barrier(),
        release = barrier();
      const first = f
        .execute(
          f.input(context, a, async (tx) => {
            await tx
              .update(inventories)
              .set({ name: 'Rollback fixture' })
              .where(eq(inventories.id, context.inventory.id));
            entered.release();
            await release.wait;
            throw new Error('abort fixture');
          }),
        )
        .then(
          () => assert.fail('Expected abort.'),
          (error: unknown) => error,
        );
      await entered.wait;
      const second = executeB(f.input(context, b));
      try {
        await waitForInventoryLock(f.pool);
      } finally {
        release.release();
      }
      assert.ok((await first) instanceof Error);
      const result = await second;
      if (result.status !== 'ACCEPTED')
        assert.fail('Expected waiter accepted.');
      assert.equal(result.changeSet.revision, '11');
      assert.deepEqual(await f.counts(context), {
        revision: '11',
        receipts: '1',
        changes: '1',
        name: context.inventory.name,
      });
    },
  );
  await t.test(
    'a different Business/Inventory commits while the first Inventory remains locked',
    async () => {
      const a = await f.dataset(),
        b = await f.dataset(),
        commandA = purchaseCommand(),
        commandB = purchaseCommand();
      const entered = barrier(),
        release = barrier();
      const first = f.execute(
        f.input(a, commandA, async () => {
          entered.release();
          await release.wait;
          return {
            status: 'ACCEPTED',
            changes: emptyChanges(),
            references: commandReferences(commandA),
          };
        }),
      );
      await entered.wait;
      try {
        const second = await bounded(executeB(f.input(b, commandB)));
        assert.equal(second.status, 'ACCEPTED');
        assert.equal((await f.counts(a)).revision, '0');
        assert.equal((await f.counts(b)).revision, '1');
      } finally {
        release.release();
        await first;
      }
    },
  );
  await t.test(
    'an unauthorized owner cannot wait on or acquire a foreign Inventory lock',
    async () => {
      const a = await f.dataset(),
        b = await f.dataset();
      const connection = await f.pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query(
          'SELECT id FROM inventories WHERE id=$1 FOR UPDATE',
          [b.inventory.id],
        );
        const forged = { ...b, user: a.user };
        await assert.rejects(
          bounded(executeB(f.input(forged, purchaseCommand()))),
          (error) =>
            error instanceof OwnershipError && error.statusCode === 404,
        );
      } finally {
        await connection.query('ROLLBACK');
        connection.release();
      }
    },
  );
});
