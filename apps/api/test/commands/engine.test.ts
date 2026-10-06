import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import {
  createSchemaValidator,
  operationReceiptSchema,
  type OperationReceipt,
} from '@stock-app/contracts';
import {
  createDatabase,
  createPostgresPool,
} from '../../src/infrastructure/postgres/client.js';
import { createCommandExecutor } from '../../src/infrastructure/postgres/command-executor.js';
import {
  commandReferences,
  findOperationReceipt,
} from '../../src/infrastructure/postgres/command-receipts.js';
import {
  businesses,
  inventories,
  operationReceipts,
  syncDevices,
  user,
} from '../../src/infrastructure/postgres/schema.js';
import { CommandError } from '../../src/commands/errors.js';
import { OwnershipError } from '../../src/ownership/errors.js';
import { emptyChanges, purchaseCommand } from '../helpers/commands.js';
import { id } from '../postgres/helpers.js';
import { engineFixture } from './helpers.js';

test('command transaction engine persists validated durable outcomes atomically in real PostgreSQL', async (t) => {
  const f = await engineFixture(t);
  await t.test(
    'same key/hash sequential retry runs callback once and stores only minimal JSONB',
    async () => {
      const context = await f.dataset(),
        command = purchaseCommand();
      let calls = 0;
      const input = f.input(context, command, async (tx) => {
        calls++;
        await tx
          .update(inventories)
          .set({ name: 'Accepted fixture write' })
          .where(eq(inventories.id, context.inventory.id));
        return {
          status: 'ACCEPTED',
          changes: emptyChanges(),
          references: commandReferences(command),
        };
      });
      const first = await f.execute(input),
        again = await f.execute(input);
      assert.deepEqual(again, first);
      assert.equal(calls, 1);
      assert.deepEqual(await f.counts(context), {
        revision: '1',
        receipts: '1',
        changes: '1',
        name: 'Accepted fixture write',
      });
      createSchemaValidator(operationReceiptSchema)(first);
      assert.equal(first.status, 'ACCEPTED');
      if (first.status !== 'ACCEPTED')
        assert.fail('Expected accepted command.');
      assert.equal(first.changeSet.serverRecordedAt, 2000);
      assert.equal(first.changeSet.revision, '1');
      const receipt = (
        await f.pool.query(
          'SELECT * FROM operation_receipts WHERE business_id=$1',
          [context.business.id],
        )
      ).rows[0];
      assert.deepEqual(receipt.result_references, {
        purchaseId: command.payload.purchaseId,
      });
      assert.equal(receipt.committed_revision, '1');
      assert.equal(receipt.device_id, null);
      assert.equal(receipt.received_at.getTime(), 2000);
      const stored = (
        await f.pool.query(
          'SELECT changes FROM inventory_change_sets WHERE inventory_id=$1',
          [context.inventory.id],
        )
      ).rows[0].changes;
      assert.deepEqual(Object.keys(stored).sort(), ['tombstones', 'upserts']);
    },
  );
  await t.test(
    'same key/different fingerprint is 409 with no callback or overwrite',
    async () => {
      const context = await f.dataset(),
        command = purchaseCommand();
      await f.execute(f.input(context, command));
      const changed = {
        ...command,
        payload: { ...command.payload, quantity: 2 },
      };
      await assert.rejects(
        f.execute(
          f.input(context, changed, async () => {
            assert.fail('No second callback.');
          }),
        ),
        (error) =>
          error instanceof CommandError &&
          error.statusCode === 409 &&
          error.code === 'IDEMPOTENCY_KEY_REUSED',
      );
      assert.deepEqual(await f.counts(context), {
        revision: '1',
        receipts: '1',
        changes: '1',
        name: context.inventory.name,
      });
    },
  );
  await t.test(
    'unexpected callback error rolls back fixture write, permits same intent retry, and consumes no revision',
    async () => {
      const context = await f.dataset(),
        command = purchaseCommand();
      await assert.rejects(
        f.execute(
          f.input(context, command, async (tx) => {
            await tx
              .update(inventories)
              .set({ name: 'Must rollback' })
              .where(eq(inventories.id, context.inventory.id));
            throw new Error('fixture transient error');
          }),
        ),
        /fixture transient/,
      );
      assert.deepEqual(await f.counts(context), {
        revision: '0',
        receipts: '0',
        changes: '0',
        name: context.inventory.name,
      });
      const result = await f.execute(f.input(context, command));
      assert.equal(result.status, 'ACCEPTED');
      if (result.status === 'ACCEPTED')
        assert.equal(result.changeSet.revision, '1');
    },
  );
  await t.test(
    'late receipt insert failure rolls back callback, revision and already-inserted ChangeSet',
    async () => {
      const context = await f.dataset(),
        command = purchaseCommand();
      const input = f.input(context, command);
      await assert.rejects(
        f.execute({
          ...input,
          execute: async (tx) => {
            await tx
              .update(inventories)
              .set({ name: 'Must rollback late' })
              .where(eq(inventories.id, context.inventory.id));
            // Controlled duplicate fixture causes the engine's final INSERT to fail, after revision/ChangeSet writes.
            await tx.insert(operationReceipts).values({
              businessId: context.business.id,
              operationId: command.operationId,
              payloadHash: input.payloadHash,
              kind: command.commandKind,
              resultCode: 'ACCEPTED',
              resultReferences: commandReferences(command),
            });
            return {
              status: 'ACCEPTED',
              changes: emptyChanges(),
              references: commandReferences(command),
            };
          },
        }),
      );
      assert.deepEqual(await f.counts(context), {
        revision: '0',
        receipts: '0',
        changes: '0',
        name: context.inventory.name,
      });
    },
  );
  for (const status of ['CONFLICT', 'REJECTED'] as const) {
    await t.test(
      `${status} is durable without mutation/revision/ChangeSet and replay uses current requestId`,
      async () => {
        const context = await f.dataset(),
          command = purchaseCommand();
        const references =
          status === 'CONFLICT'
            ? {
                errorCode: 'REVISION_CONFLICT' as const,
                currentRevision: '9007199254740993',
              }
            : { errorCode: 'DOMAIN_RULE' as const };
        let calls = 0;
        const input = f.input(
          context,
          command,
          async (tx) => {
            calls++;
            await tx
              .update(inventories)
              .set({ name: 'Terminal write must rollback' })
              .where(eq(inventories.id, context.inventory.id));
            return { status, references };
          },
          'old-request',
        );
        const first = await f.execute(input);
        const again = await f.execute({ ...input, requestId: 'new-request' });
        assert.equal(calls, 1);
        assert.equal(first.status, status);
        assert.equal(again.status, status);
        assert.equal(first.error.requestId, 'old-request');
        assert.equal(again.error.requestId, 'new-request');
        assert.deepEqual(
          { ...again.error, requestId: 'old-request' },
          first.error,
        );
        assert.deepEqual(await f.counts(context), {
          revision: '0',
          receipts: '1',
          changes: '0',
          name: context.inventory.name,
        });
        const row = (
          await f.pool.query(
            'SELECT committed_revision,result_references FROM operation_receipts WHERE business_id=$1',
            [context.business.id],
          )
        ).rows[0];
        assert.equal(row.committed_revision, null);
        assert.deepEqual(row.result_references, references);
        await assert.rejects(
          f.execute(
            f.input(context, {
              ...command,
              payload: { ...command.payload, quantity: 2 },
            }),
          ),
          (error) =>
            error instanceof CommandError &&
            error.code === 'IDEMPOTENCY_KEY_REUSED',
        );
      },
    );
  }
  await t.test(
    'invalid callback changes and unknown receipt fields abort every write',
    async () => {
      const context = await f.dataset(),
        command = purchaseCommand();
      for (const invalid of ['changes', 'references', 'terminal'] as const) {
        await assert.rejects(
          f.execute(
            f.input(context, command, async (tx) => {
              await tx
                .update(inventories)
                .set({ name: 'Invalid output' })
                .where(eq(inventories.id, context.inventory.id));
              if (invalid === 'terminal')
                return {
                  status: 'REJECTED',
                  references: Object.assign(
                    { errorCode: 'DOMAIN_RULE' as const },
                    { requestId: 'must-not-persist' },
                  ),
                };
              return {
                status: 'ACCEPTED',
                changes:
                  invalid === 'changes'
                    ? Object.assign(emptyChanges(), {
                        inventoryId: context.inventory.id,
                      })
                    : emptyChanges(),
                references:
                  invalid === 'references'
                    ? Object.assign(commandReferences(command), {
                        payload: 'must-not-persist',
                      })
                    : commandReferences(command),
              };
            }),
          ),
          TypeError,
        );
        assert.deepEqual(await f.counts(context), {
          revision: '0',
          receipts: '0',
          changes: '0',
          name: context.inventory.name,
        });
      }
    },
  );
  await t.test(
    'scope-mismatched upserts and mismatched accepted references are rejected before commit',
    async () => {
      const context = await f.dataset(),
        foreign = await f.dataset(),
        command = purchaseCommand();
      const changes = emptyChanges();
      changes.upserts.products.push({
        id: id(),
        inventoryId: foreign.inventory.id,
        name: 'Foreign fixture',
        variant: null,
        barcode: null,
        regularSalePrice: '0',
        minimumStock: null,
        isArchived: false,
        metadataRevision: '0',
        createdAt: 100,
        updatedAt: 100,
      });
      await assert.rejects(
        f.execute(
          f.input(context, command, async () => ({
            status: 'ACCEPTED',
            changes,
            references: commandReferences(command),
          })),
        ),
        /scope/,
      );
      await assert.rejects(
        f.execute(
          f.input(context, command, async () => ({
            status: 'ACCEPTED',
            changes: emptyChanges(),
            references: { purchaseId: id() },
          })),
        ),
        /reference/,
      );
      assert.equal((await f.counts(context)).revision, '0');
    },
  );
  await t.test(
    'nonterminal outcomes and financial tombstones cannot create receipts or revisions',
    async () => {
      const context = await f.dataset(),
        command = purchaseCommand();
      const outcome = {
        status: 'ACCEPTED' as const,
        changes: emptyChanges(),
        references: commandReferences(command),
      };
      Object.defineProperty(outcome, 'status', { value: 'DEPENDENCY_BLOCKED' });
      await assert.rejects(
        f.execute(f.input(context, command, async () => outcome)),
        /Unsupported/,
      );
      const changes = emptyChanges();
      Object.defineProperty(changes, 'tombstones', { value: [{ id: id() }] });
      await assert.rejects(
        f.execute(
          f.input(context, command, async () => ({
            status: 'ACCEPTED',
            changes,
            references: commandReferences(command),
          })),
        ),
        TypeError,
      );
      assert.equal((await f.counts(context)).revision, '0');
      assert.equal((await f.counts(context)).receipts, '0');
    },
  );
  await t.test(
    'invalid server recording clock rolls back an already-written callback',
    async () => {
      const context = await f.dataset(),
        command = purchaseCommand();
      let clocks = 0;
      const execute = createCommandExecutor(f.db, () =>
        clocks++ === 0 ? 2000 : NaN,
      );
      await assert.rejects(
        execute(
          f.input(context, command, async (tx) => {
            await tx
              .update(inventories)
              .set({ name: 'Bad clock must rollback' })
              .where(eq(inventories.id, context.inventory.id));
            return {
              status: 'ACCEPTED',
              changes: emptyChanges(),
              references: commandReferences(command),
            };
          }),
        ),
        TypeError,
      );
      assert.deepEqual(await f.counts(context), {
        revision: '0',
        receipts: '0',
        changes: '0',
        name: context.inventory.name,
      });
    },
  );
  await t.test(
    'server-computed fingerprint mismatch is rejected without entering callback',
    async () => {
      const context = await f.dataset(),
        command = purchaseCommand();
      const input = f.input(context, command, async () => {
        assert.fail('Invalid hash must not execute.');
      });
      await assert.rejects(
        f.execute({ ...input, payloadHash: 'a'.repeat(64) }),
        (error) => error instanceof CommandError && error.statusCode === 400,
      );
      assert.equal((await f.counts(context)).receipts, '0');
    },
  );
  await t.test(
    'cached context is revalidated for owner, Inventory, enabled flag, ACTIVE and verified status',
    async () => {
      const context = await f.dataset(),
        foreign = await f.dataset(),
        command = purchaseCommand();
      await assert.rejects(
        f.execute(
          f.input({ ...context, inventory: foreign.inventory }, command),
        ),
        (error) => error instanceof OwnershipError && error.statusCode === 404,
      );
      await assert.rejects(
        f.execute(f.input({ ...foreign, user: context.user }, command)),
        (error) => error instanceof OwnershipError && error.statusCode === 404,
      );
      await f.db
        .update(businesses)
        .set({ cloudAccessEnabled: false })
        .where(eq(businesses.id, context.business.id));
      await assert.rejects(
        f.execute(f.input(context, command)),
        (error) =>
          error instanceof OwnershipError &&
          error.code === 'CLOUD_ACCESS_DISABLED',
      );
      await f.db
        .update(businesses)
        .set({ cloudAccessEnabled: true, status: 'DELETING' })
        .where(eq(businesses.id, context.business.id));
      await assert.rejects(
        f.execute(f.input(context, command)),
        (error) =>
          error instanceof OwnershipError &&
          error.code === 'CLOUD_ACCESS_DISABLED',
      );
      await f.db
        .update(businesses)
        .set({ status: 'ACTIVE' })
        .where(eq(businesses.id, context.business.id));
      await f.db
        .update(user)
        .set({ emailVerified: false })
        .where(eq(user.id, context.user.id));
      await assert.rejects(
        f.execute(f.input(context, command)),
        (error) =>
          error instanceof OwnershipError &&
          error.code === 'EMAIL_NOT_VERIFIED',
      );
      assert.equal((await f.counts(context)).receipts, '0');
    },
  );
  await t.test(
    'unknown/foreign device fails before callback; existing scoped device is stored without registration',
    async () => {
      const context = await f.dataset(),
        foreign = await f.dataset(),
        command = purchaseCommand();
      const deviceId = id(),
        withDevice = { ...command, deviceId };
      await assert.rejects(
        f.execute(f.input(context, withDevice)),
        (error) => error instanceof CommandError && error.statusCode === 400,
      );
      assert.equal(
        (await f.pool.query('SELECT id FROM sync_devices')).rowCount,
        0,
      );
      await f.db.insert(syncDevices).values({
        id: deviceId,
        businessId: foreign.business.id,
        protocolVersion: 1,
        domainVersion: '1',
      });
      await assert.rejects(
        f.execute(f.input(context, withDevice)),
        (error) => error instanceof CommandError && error.statusCode === 400,
      );
      await f.db.delete(syncDevices).where(eq(syncDevices.id, deviceId));
      await f.db.insert(syncDevices).values({
        id: deviceId,
        businessId: context.business.id,
        protocolVersion: 1,
        domainVersion: '1',
      });
      await f.execute(f.input(context, withDevice));
      assert.equal(
        (
          await f.pool.query(
            'SELECT device_id FROM operation_receipts WHERE business_id=$1',
            [context.business.id],
          )
        ).rows[0].device_id,
        deviceId,
      );
    },
  );
  await t.test(
    'BIGINT revision exceeds JS-safe range exactly and int64 overflow rolls back callback',
    async () => {
      const context = await f.dataset();
      await f.db
        .update(inventories)
        .set({ revision: 9007199254740993n })
        .where(eq(inventories.id, context.inventory.id));
      const result = await f.execute(f.input(context, purchaseCommand()));
      if (result.status !== 'ACCEPTED')
        assert.fail('Expected accepted result.');
      assert.equal(result.changeSet.revision, '9007199254740994');
      assert.equal((await f.counts(context)).revision, '9007199254740994');
      const maximum = await f.dataset();
      const overflowCommand = purchaseCommand();
      await f.db
        .update(inventories)
        .set({ revision: 9223372036854775807n })
        .where(eq(inventories.id, maximum.inventory.id));
      await assert.rejects(
        f.execute(
          f.input(maximum, overflowCommand, async (tx) => {
            await tx
              .update(inventories)
              .set({ name: 'Overflow write' })
              .where(eq(inventories.id, maximum.inventory.id));
            return {
              status: 'ACCEPTED',
              changes: emptyChanges(),
              references: commandReferences(overflowCommand),
            };
          }),
        ),
        /overflow/,
      );
      assert.deepEqual(await f.counts(maximum), {
        revision: '9223372036854775807',
        receipts: '0',
        changes: '0',
        name: maximum.inventory.name,
      });
    },
  );
  await t.test(
    'lost ACK replay survives closing pool A and creating a new executor/pool B',
    async () => {
      const context = await f.dataset(),
        command = purchaseCommand();
      assert.ok(f.pool.options.connectionString);
      const poolA = createPostgresPool(f.pool.options.connectionString);
      let first: OperationReceipt;
      try {
        first = await createCommandExecutor(
          createDatabase(poolA),
          () => 2000,
        )(f.input(context, command));
      } finally {
        await poolA.end();
      }
      const poolB = createPostgresPool(f.pool.options.connectionString);
      try {
        const second = await createCommandExecutor(createDatabase(poolB))(
          f.input(context, command, async () => {
            assert.fail('Restart replay must not execute.');
          }),
        );
        assert.deepEqual(second, first);
        assert.equal((await f.counts(context)).revision, '1');
      } finally {
        await poolB.end();
      }
    },
  );
  await t.test(
    'receipt reads and identical operation IDs remain Business-scoped',
    async () => {
      const a = await f.dataset(),
        b = await f.dataset(),
        command = purchaseCommand();
      await f.execute(f.input(a, command));
      assert.equal(
        await findOperationReceipt(
          f.db,
          { businessId: b.business.id, inventoryId: b.inventory.id },
          command.operationId,
          'b',
        ),
        null,
      );
      await f.execute(f.input(b, command));
      assert.equal((await f.counts(a)).receipts, '1');
      assert.equal((await f.counts(b)).receipts, '1');
    },
  );
  await t.test(
    'corrupt stored receipt fails closed on executor replay without callback',
    async () => {
      const context = await f.dataset(),
        command = purchaseCommand();
      await f.execute(f.input(context, command));
      await f.pool.query(
        'UPDATE operation_receipts SET result_references=$1::jsonb WHERE business_id=$2',
        [
          JSON.stringify({
            purchaseId: command.payload.purchaseId,
            stack: 'fictional-sensitive-canary',
          }),
          context.business.id,
        ],
      );
      await assert.rejects(
        f.execute(
          f.input(context, command, async () => {
            assert.fail('Corrupt replay must not execute.');
          }),
        ),
        TypeError,
      );
      assert.equal((await f.counts(context)).revision, '1');
    },
  );
});
