import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type pg from 'pg';
import { deletionFixture } from '../deletion/helpers.js';
import { disposableDatabase, id } from './helpers.js';
import { postgresTools } from '../helpers/postgres-tools.js';
import { createCommand, updateCommand } from '../products/helpers.js';
import { decodeRegistry } from '../../src/deletion/registry.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { createCommandExecutor } from '../../src/infrastructure/postgres/command-executor.js';
import { commandFingerprint } from '../../src/commands/fingerprint.js';
import { createReadinessCheck } from '../../src/infrastructure/postgres/readiness.js';
import { suppressionIdentifier } from '../../src/deletion/model.js';
import { createAuth } from '../../src/auth/create-auth.js';
import {
  resolveAuthenticatedUser,
  resolveCloudInventory,
} from '../../src/ownership/context.js';

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function snapshot(pool: pg.Pool) {
  const tables = (
    await pool.query<{ schemaname: string; tablename: string }>(
      "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','drizzle') ORDER BY schemaname,tablename",
    )
  ).rows;
  const rows = [];
  for (const table of tables) {
    assert.match(table.schemaname, /^[a-z_]+$/);
    assert.match(table.tablename, /^[a-z_]+$/);
    const result = await pool.query(
      `SELECT row_to_json(t)::text AS row FROM "${table.schemaname}"."${table.tablename}" t ORDER BY row_to_json(t)::text`,
    );
    rows.push({
      table: table.tablename,
      count: result.rowCount,
      digest: digest(result.rows),
    });
  }
  const structure = (
    await pool.query(
      "SELECT c.relname,n.nspname,p.conname,p.contype,p.convalidated,pg_get_constraintdef(p.oid) AS definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') ORDER BY n.nspname,c.relname,p.conname",
    )
  ).rows;
  const sequences = (
    await pool.query(
      "SELECT schemaname,sequencename,last_value FROM pg_sequences WHERE schemaname IN ('public','drizzle') ORDER BY schemaname,sequencename",
    )
  ).rows;
  return { rows, constraints: digest(structure), sequences: digest(sequences) };
}

async function survivor(pool: pg.Pool, userId: string, inventoryId: string) {
  const rows: unknown[] = [];
  for (const table of [
    'products',
    'inventory_states',
    'inventory_movements',
    'sales',
    'sale_items',
    'purchases',
    'stock_adjustments',
    'inventory_change_sets',
  ])
    rows.push(
      (
        await pool.query(
          `SELECT row_to_json(t)::text AS row FROM "${table}" t WHERE inventory_id=$1 ORDER BY row_to_json(t)::text`,
          [inventoryId],
        )
      ).rows,
    );
  rows.push(
    (
      await pool.query(
        'SELECT row_to_json(t)::text AS row FROM "user" t WHERE id=$1',
        [userId],
      )
    ).rows,
  );
  for (const table of ['account', 'session'])
    rows.push(
      (
        await pool.query(
          `SELECT row_to_json(t)::text AS row FROM "${table}" t WHERE user_id=$1 ORDER BY row_to_json(t)::text`,
          [userId],
        )
      ).rows,
    );
  rows.push(
    (
      await pool.query(
        'SELECT row_to_json(t)::text AS row FROM businesses t WHERE owner_user_id=$1',
        [userId],
      )
    ).rows,
  );
  return digest(rows);
}

test(
  'PostgreSQL 18.6 logical snapshot restores exact history; independent suppression precedes recovery verification',
  { timeout: 60000 },
  async (t) => {
    const f = await deletionFixture(t);
    const a = await f.owner('recovery-a');
    const b = await f.owner('recovery-b');
    const history = await f.history(a.context, 'recovery-a');
    const bHistory = await f.history(b.context, 'recovery-b');
    const precision = createCommand({
      name: 'Recovery precision',
      regularSalePrice: '9007199254740991',
      initialStock: 1,
      initialUnitCost: '1234567',
      initialMovementId: id(),
    });
    await f.run(a.context, precision);
    await f.pool.query(
      'UPDATE products SET metadata_revision=9007199254740992 WHERE id=$1',
      [history.archived.payload.productId],
    );
    await f.pool.query(
      'UPDATE inventory_states SET state_revision=9007199254740992 WHERE product_id=$1',
      [history.archived.payload.productId],
    );
    const before = await snapshot(f.pool);
    const bBefore = await survivor(
      f.pool,
      b.authenticated.user.id,
      b.context.inventory.id,
    );
    assert.ok(f.pool.options.connectionString);
    const tools = await postgresTools(f.pool.options.connectionString);
    const held = await f.pool.connect();
    let dump: Buffer;
    try {
      await held.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const exported = (
        await held.query<{ snapshot: string }>(
          'SELECT pg_export_snapshot() AS snapshot',
        )
      ).rows[0].snapshot;
      // The writer commits after the exported snapshot. Its receipt and metadata
      // must both be excluded from the old dump, while the source remains usable.
      await f.run(
        a.context,
        updateCommand(history.zero.payload.productId, '0', {
          regularSalePrice: '1234567',
        }),
      );
      dump = await tools.dump(exported);
    } finally {
      await held.query('ROLLBACK');
      held.release();
    }
    assert.ok(dump.subarray(0, 5).equals(Buffer.from('PGDMP')));
    assert.notEqual(digest(await snapshot(f.pool)), digest(before));
    const privateDirectory = await mkdtemp(
      join(tmpdir(), 'stockapp-dev02-recovery-'),
    );
    t.after(() => rm(privateDirectory, { recursive: true, force: true }));
    const archive = join(privateDirectory, 'snapshot.dump');
    await writeFile(archive, dump, { flag: 'wx', mode: 0o600 });
    assert.equal(digest(await readFile(archive)), digest(dump));
    const key = id();
    assert.equal((await f.request(a.cookie, key)).statusCode, 202);
    await f.purge(key);
    const registryFile = join(privateDirectory, 'suppressions.json');
    const cli = fileURLToPath(
      new URL('../../dist/deletion/registry-cli.js', import.meta.url),
    );
    const cliEnv = {
      ...process.env,
      DATABASE_URL: f.pool.options.connectionString,
      BETTER_AUTH_SECRET: f.keys.authSecret,
      DELETION_SUPPRESSION_SECRET: f.keys.suppressionSecret,
    };
    const invoke = async (action: 'export' | 'apply', env = cliEnv) => {
      try {
        const output = await promisify(execFile)(
          process.execPath,
          [
            cli,
            action,
            action === 'export' ? '--output' : '--input',
            registryFile,
          ],
          { env, windowsHide: true },
        );
        assert.equal(
          /postgresql:|fictional-|@example\.test/.test(
            output.stdout + output.stderr,
          ),
          false,
        );
        return output.stdout;
      } catch {
        throw new Error(
          'Compiled suppression rehearsal failed; diagnostics withheld.',
        );
      }
    };
    await invoke('export');
    const registry = decodeRegistry(
      JSON.parse(await readFile(registryFile, 'utf8')),
    );
    assert.equal(registry.identifiers.length, 1);
    assert.equal(
      JSON.stringify(registry).includes(a.authenticated.user.id),
      false,
    );
    assert.equal(JSON.stringify(registry).includes(a.email), false);
    assert.equal(
      JSON.stringify(registry).includes(f.keys.suppressionSecret),
      false,
    );
    const restored = await disposableDatabase(t);
    assert.ok(restored.options.connectionString);
    await (
      await postgresTools(restored.options.connectionString)
    ).restore(await readFile(archive));
    assert.equal(digest(await snapshot(restored)), digest(before));
    const replayBefore = digest(await snapshot(restored));
    const replay = await createCommandExecutor(createDatabase(restored))({
      context: b.context,
      command: bHistory.zero,
      payloadHash: commandFingerprint(b.context.inventory.id, bHistory.zero),
      requestId: 'recovery-durable-replay',
      execute: async () =>
        assert.fail(
          'Restored receipt must prevent a second executor mutation.',
        ),
    });
    assert.equal(replay.status, 'ACCEPTED');
    assert.equal(digest(await snapshot(restored)), replayBefore);
    await assert.rejects(
      restored.query(
        'UPDATE inventory_states SET last_movement_id=$1 WHERE product_id=$2',
        [id(), precision.payload.productId],
      ),
      { code: '23503' },
    );
    const money = (
      await restored.query(
        'SELECT regular_sale_price_units::text,unit_cost_units::text FROM products p JOIN inventory_states s ON s.product_id=p.id AND s.inventory_id=p.inventory_id WHERE p.id=$1',
        [precision.payload.productId],
      )
    ).rows[0];
    assert.equal(money.regular_sale_price_units, '9007199254740991');
    assert.equal(money.unit_cost_units, '1234567');
    const ready = createReadinessCheck(restored.options.connectionString);
    t.after(() => ready.close());
    assert.equal(await ready.check(), true);
    const exact = (
      await restored.query(
        'SELECT metadata_revision::text,state_revision::text FROM products p JOIN inventory_states s ON s.product_id=p.id AND s.inventory_id=p.inventory_id WHERE p.id=$1',
        [history.archived.payload.productId],
      )
    ).rows[0];
    assert.equal(exact.metadata_revision, '9007199254740992');
    assert.equal(exact.state_revision, '9007199254740992');
    assert.equal(
      (
        await restored.query(
          'SELECT unit_cost_units FROM inventory_states WHERE product_id=$1',
          [history.zero.payload.productId],
        )
      ).rows[0].unit_cost_units,
      '0',
    );
    assert.equal(
      (
        await restored.query(
          'SELECT unit_cost_units FROM inventory_states WHERE product_id=$1',
          [history.unknown.payload.productId],
        )
      ).rows[0].unit_cost_units,
      null,
    );
    assert.ok(
      (await restored.query("SELECT id FROM sales WHERE status='VOIDED'"))
        .rowCount,
    );
    assert.ok(
      (await restored.query("SELECT id FROM purchases WHERE status='VOIDED'"))
        .rowCount,
    );
    assert.ok(
      (await restored.query('SELECT id FROM products WHERE is_archived'))
        .rowCount,
    );
    assert.ok(
      (await restored.query('SELECT operation_id FROM operation_receipts'))
        .rowCount,
    );
    assert.ok(
      (await restored.query('SELECT revision FROM inventory_change_sets'))
        .rowCount,
    );
    const restoredEnv = {
      ...cliEnv,
      DATABASE_URL: restored.options.connectionString,
    };
    const recovered = async () => {
      const remaining = (
        await restored.query<{ id: string }>('SELECT id FROM "user"')
      ).rows;
      return remaining.every(
        (row) =>
          !registry.identifiers.includes(
            suppressionIdentifier(f.keys.suppressionSecret, row.id),
          ),
      );
    };
    const wrongBefore = digest(await snapshot(restored));
    await invoke('apply', {
      ...restoredEnv,
      DELETION_SUPPRESSION_SECRET: 'fictional-dev02-wrong-key-valid-length',
    });
    // API-10's format does not authenticate the key. Exit0 and schema readiness
    // alone never certify recovery. The known deleted identity is still present.
    assert.equal(digest(await snapshot(restored)), wrongBefore);
    assert.equal(await recovered(), false);
    assert.equal(await ready.check(), true);
    await invoke('apply', restoredEnv);
    assert.equal(await recovered(), true);
    assert.equal(
      (
        await restored.query('SELECT id FROM "user" WHERE id=$1', [
          a.authenticated.user.id,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      await survivor(restored, b.authenticated.user.id, b.context.inventory.id),
      bBefore,
    );
    const after = digest(await snapshot(restored));
    await invoke('apply', restoredEnv);
    assert.equal(digest(await snapshot(restored)), after);
    assert.equal(await ready.check(), true);
    const restoredDatabase = createDatabase(restored);
    const restoredAuth = createAuth({
      database: restoredDatabase,
      config: f.config,
      emailSender: {
        async send() {
          assert.fail('Recovery reads must not send email.');
        },
      },
    });
    t.after(() => restoredAuth.drainEmails());
    const authenticated = await resolveAuthenticatedUser(restoredAuth.auth, {
      cookie: b.cookie,
    });
    assert.equal(authenticated.user.id, b.authenticated.user.id);
    assert.equal(authenticated.user.emailVerified, true);
    const own = await resolveCloudInventory(
      restoredDatabase,
      authenticated,
      b.context.inventory.id,
    );
    assert.equal(own.business.id, b.context.business.id);
    assert.equal(own.inventory.id, b.context.inventory.id);
    await assert.rejects(
      resolveCloudInventory(
        restoredDatabase,
        authenticated,
        a.context.inventory.id,
      ),
      { statusCode: 404, code: 'NOT_FOUND' },
    );
    await assert.rejects(
      resolveAuthenticatedUser(restoredAuth.auth, { cookie: a.cookie }),
      { statusCode: 401, code: 'UNAUTHENTICATED' },
    );
    assert.equal(
      (
        await f.pool.query('SELECT id FROM "user" WHERE id=$1', [
          a.authenticated.user.id,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      await survivor(f.pool, b.authenticated.user.id, b.context.inventory.id),
      bBefore,
    );
  },
);
