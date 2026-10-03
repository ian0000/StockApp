import { authConfig } from '../auth/helpers.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { createSecurity } from '../../src/security/policy.js';
import {
  disposableDatabase,
  insertFixtureUser,
  id,
  migrationPrefix,
} from '../postgres/helpers.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';

test('CLOUD-04 upgrade preserves auth, sessions and ownership; rate table is additive and rerun no-op', async (t) => {
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool, await migrationPrefix(t, 4));
  await insertFixtureUser(pool, 'security-upgrade');
  const business = id(),
    inventory = id();
  await pool.query(
    'INSERT INTO businesses(id,owner_user_id,cloud_access_enabled) VALUES($1,$2,true)',
    [business, 'security-upgrade'],
  );
  await pool.query(
    "INSERT INTO inventories(id,business_id,name,currency,reporting_time_zone,created_at,updated_at) VALUES($1,$2,'Fictional','USD','UTC',1,1)",
    [inventory, business],
  );
  await pool.query(
    "INSERT INTO session(id,token,user_id,expires_at,updated_at) VALUES('session-fixture','opaque-fictional-token','security-upgrade',now()+interval '1 day',now())",
  );
  await pool.query(
    "INSERT INTO account(id,account_id,provider_id,user_id,updated_at,password) VALUES('account-fixture','security-upgrade','credential','security-upgrade',now(),'fictional-hash')",
  );
  await pool.query(
    "INSERT INTO verification(id,identifier,value,expires_at) VALUES('verification-fixture','fictional-identifier','fictional-value',now()+interval '1 hour')",
  );
  const tables = [
    'user',
    'session',
    'account',
    'verification',
    'businesses',
    'inventories',
  ];
  const before = await Promise.all(
    tables.map((table) => pool.query(`SELECT * FROM "${table}"`)),
  );
  await migrateDatabase(pool);
  for (const [i, table] of tables.entries())
    assert.deepEqual(
      (await pool.query(`SELECT * FROM "${table}"`)).rows,
      before[i].rows,
    );
  assert.equal(
    (await pool.query('SELECT * FROM security_rate_limits')).rowCount,
    0,
  );
  const journal = (
    await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')
  ).rows;
  assert.equal(journal.length, 5);
  await migrateDatabase(pool);
  assert.deepEqual(
    (await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id'))
      .rows,
    journal,
  );
  const security = createSecurity(
    createDatabase(pool),
    authConfig.secret,
    () => 1000,
  );
  assert.equal(
    (
      await security.consume('upgrade-fixture', 'fictional-key', {
        window: 60,
        max: 5,
      })
    ).allowed,
    true,
  );
});
