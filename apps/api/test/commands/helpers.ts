import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { eq } from 'drizzle-orm';
import type { CommandEnvelopeV1 } from '@stock-app/contracts';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';
import {
  businesses,
  inventories,
  user,
} from '../../src/infrastructure/postgres/schema.js';
import {
  createCommandExecutor,
  type CloudInventoryContext,
  type ExecuteCommandInput,
} from '../../src/infrastructure/postgres/command-executor.js';
import { commandReferences } from '../../src/infrastructure/postgres/command-receipts.js';
import { commandFingerprint } from '../../src/commands/fingerprint.js';
import {
  disposableDatabase,
  id,
  insertFixtureUser,
} from '../postgres/helpers.js';
import { emptyChanges } from '../helpers/commands.js';

export async function engineFixture(t: TestContext) {
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool);
  const db = createDatabase(pool);
  const execute = createCommandExecutor(db, () => 2000);
  async function dataset(): Promise<CloudInventoryContext> {
    const userId = `owner-${id()}`;
    await insertFixtureUser(pool, userId);
    const [owner] = await db.select().from(user).where(eq(user.id, userId));
    const [business] = await db
      .insert(businesses)
      .values({
        id: id(),
        ownerUserId: userId,
        status: 'ACTIVE',
        cloudAccessEnabled: true,
      })
      .returning();
    const [inventory] = await db
      .insert(inventories)
      .values({
        id: id(),
        businessId: business.id,
        name: 'Fixture Inventory',
        currency: 'USD',
        reportingTimeZone: 'UTC',
        createdAt: 100n,
        updatedAt: 100n,
      })
      .returning();
    assert.ok(owner);
    return { user: owner, business, inventory };
  }
  function input(
    context: CloudInventoryContext,
    command: CommandEnvelopeV1,
    callback?: ExecuteCommandInput['execute'],
    requestId = 'request-current',
  ): ExecuteCommandInput {
    return {
      context,
      command,
      requestId,
      payloadHash: commandFingerprint(context.inventory.id, command),
      execute:
        callback ??
        (async () => ({
          status: 'ACCEPTED',
          changes: emptyChanges(),
          references: commandReferences(command),
        })),
    };
  }
  async function counts(context: CloudInventoryContext) {
    const result = await pool.query<{
      revision: string;
      receipts: string;
      changes: string;
      name: string;
    }>(
      `
      SELECT i.revision, i.name,
      (SELECT count(*) FROM operation_receipts r WHERE r.business_id=i.business_id) receipts,
      (SELECT count(*) FROM inventory_change_sets c WHERE c.inventory_id=i.id) changes
      FROM inventories i WHERE i.id=$1`,
      [context.inventory.id],
    );
    return result.rows[0];
  }
  return { pool, db, execute, dataset, input, counts };
}

export async function waitForInventoryLock(
  pool: Awaited<ReturnType<typeof engineFixture>>['pool'],
) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    const rows =
      await pool.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
      AND wait_event_type='Lock' AND query LIKE '%inventories%' AND pid<>pg_backend_pid()`);
    if (rows.rowCount) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Expected PostgreSQL-observed Inventory lock waiter.');
}
