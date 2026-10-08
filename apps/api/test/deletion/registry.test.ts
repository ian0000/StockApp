import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { deletionFixture, suppressionSecret } from './helpers.js';
import { id, disposableDatabase } from '../postgres/helpers.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import {
  exportSuppressionRegistry,
  applySuppressionRegistry,
  decodeRegistry,
} from '../../src/deletion/registry.js';
import {
  readSuppressionSecret,
  suppressionIdentifier,
} from '../../src/deletion/model.js';
import { createRateKeyHasher } from '../../src/security/policy.js';

test('dedicated HMAC key preserves opaque ID spelling and strict registry has no PII', () => {
  assert.throws(() => readSuppressionSecret({}));
  assert.throws(() =>
    readSuppressionSecret({ DELETION_SUPPRESSION_SECRET: 'short' }),
  );
  assert.equal(
    suppressionIdentifier(suppressionSecret, 'Opaque-ID'),
    createHmac('sha256', suppressionSecret).update('Opaque-ID').digest('hex'),
  );
  assert.notEqual(
    suppressionIdentifier(suppressionSecret, 'Opaque-ID'),
    suppressionIdentifier(suppressionSecret, 'opaque-id'),
  );
  const valid = {
    format: 'stockapp-deletion-suppressions',
    version: 1,
    identifiers: [suppressionIdentifier(suppressionSecret, 'Opaque-ID')],
  };
  assert.doesNotThrow(() => decodeRegistry(valid));
  for (const bad of [
    { ...valid, email: 'private@example.test' },
    { ...valid, version: 2 },
    { ...valid, identifiers: [...valid.identifiers, ...valid.identifiers] },
    { ...valid, identifiers: ['user-id'] },
  ])
    assert.throws(() => decodeRegistry(bad));
});

test('restoring a pre-deletion full dataset with independent registry cannot resurrect A; B and shared IP rates survive', async (t) => {
  const f = await deletionFixture(t),
    a = await f.owner('restore-a'),
    b = await f.owner('restore-b'),
    key = id();
  await f.history(a.context, 'restore-a');
  await f.history(b.context, 'restore-b');
  await f.post('request-password-reset', { email: a.email });
  const hash = createRateKeyHasher(f.config.secret);
  const ipHash = hash('auth-sensitive-ip', '127.0.0.1');
  await f.runtime.auth.security.consume('auth-sensitive-ip', '127.0.0.1', {
    window: 60,
    max: 30,
  });
  // Full old DB fixture, including identity, ledger and protocol delivery metadata.
  const tables = [
    'user',
    'account',
    'session',
    'verification',
    'businesses',
    'inventories',
    'products',
    'sales',
    'purchases',
    'stock_adjustments',
    'inventory_movements',
    'inventory_states',
    'sale_items',
    'sync_devices',
    'operation_receipts',
    'inventory_change_sets',
    'import_sessions',
    'security_rate_limits',
  ];
  const old = await Promise.all(
    tables.map(async (table) => ({
      table,
      rows: (await f.pool.query(`SELECT * FROM "${table}"`)).rows as Record<
        string,
        unknown
      >[],
    })),
  );
  await f.request(a.cookie, key);
  await f.purge(key);
  const registry = await exportSuppressionRegistry(f.db);
  assert.equal(registry.identifiers.length, 1);
  assert.deepEqual(registry.identifiers, [
    suppressionIdentifier(suppressionSecret, a.authenticated.user.id),
  ]);
  assert.doesNotMatch(
    JSON.stringify(registry),
    new RegExp(
      `${a.email}|${a.authenticated.user.id}|${a.context.business.id}`,
    ),
  );
  const restoredPool = await disposableDatabase(t);
  await migrateDatabase(restoredPool);
  for (const table of old) {
    if (table.table === 'inventory_movements')
      table.rows.sort(
        (x, y) =>
          Number(x.reversal_of_movement_id !== null) -
          Number(y.reversal_of_movement_id !== null),
      );
    for (const row of table.rows) {
      const columns = Object.keys(row);
      const values = Object.values(row).map((value) =>
        value instanceof Date ? value.toISOString() : value,
      );
      await restoredPool.query(
        `INSERT INTO "${table.table}" (${columns.map((c) => `"${c}"`).join(',')}) VALUES(${columns.map((_, i) => `$${i + 1}`).join(',')})`,
        values,
      );
    }
  }
  const restored = createDatabase(restoredPool);
  assert.equal(
    (
      await restoredPool.query('SELECT id FROM "user" WHERE id=$1', [
        a.authenticated.user.id,
      ])
    ).rowCount,
    1,
  );
  assert.equal(await applySuppressionRegistry(restored, registry, f.keys), 1);
  assert.equal(await applySuppressionRegistry(restored, registry, f.keys), 0);
  assert.equal(
    (
      await restoredPool.query('SELECT id FROM "user" WHERE id=$1', [
        a.authenticated.user.id,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await restoredPool.query('SELECT id FROM businesses WHERE id=$1', [
        a.context.business.id,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await restoredPool.query('SELECT id FROM inventories WHERE id=$1', [
        a.context.inventory.id,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await restoredPool.query('SELECT id FROM "user" WHERE id=$1', [
        b.authenticated.user.id,
      ])
    ).rowCount,
    1,
  );
  assert.ok(
    (
      await restoredPool.query(
        'SELECT id FROM products WHERE inventory_id=$1',
        [b.context.inventory.id],
      )
    ).rowCount,
  );
  assert.equal(
    (
      await restoredPool.query(
        'SELECT key_hash FROM security_rate_limits WHERE scope=$1 AND key_hash=$2',
        ['auth-sensitive-ip', ipHash],
      )
    ).rowCount,
    1,
  );
  for (const [scope, value] of [
    ['business-read-user', a.authenticated.user.id],
    ['business-command-user', a.authenticated.user.id],
    ['auth-login-email', a.email],
    ['auth-reset-email', a.email],
  ])
    assert.equal(
      (
        await restoredPool.query(
          'SELECT key_hash FROM security_rate_limits WHERE scope=$1 AND key_hash=$2',
          [scope, hash(scope!, value!)],
        )
      ).rowCount,
      0,
    );
  assert.deepEqual(await exportSuppressionRegistry(restored), registry);
});
