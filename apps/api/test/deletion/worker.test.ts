import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deletionFixture } from './helpers.js';
import { id } from '../postgres/helpers.js';
import {
  claimDeletion,
  advanceDeletion,
  releaseFailedDeletion,
  DELETION_LEASE_MS,
} from '../../src/deletion/worker.js';
import { createDeletionRunner } from '../../src/deletion/runner.js';

test('complete ledger/delivery/auth purge is FK-safe, scoped and leaves only minimum suppression', async (t) => {
  const f = await deletionFixture(t),
    a = await f.owner('purge-a'),
    b = await f.owner('purge-b'),
    key = id();
  await f.history(a.context, 'purge-a');
  await f.history(b.context, 'purge-b');
  const device = id();
  await f.pool.query(
    "INSERT INTO sync_devices(id,business_id,protocol_version,domain_version) VALUES($1,$2,1,'1')",
    [device, a.context.business.id],
  );
  await f.pool.query(
    'UPDATE operation_receipts SET device_id=$1 WHERE business_id=$2',
    [device, a.context.business.id],
  );
  await f.pool.query(
    "INSERT INTO import_sessions(id,business_id,hash,inventory_id,expected_empty_generation,bytes,chunks,status,expires_at,consent_recorded_at) VALUES($1,$2,$3,$4,$5,0,0,'RESERVED',now()+interval '1 day',now())",
    [id(), a.context.business.id, 'a'.repeat(64), a.context.inventory.id, id()],
  );
  await f.post('request-password-reset', { email: a.email });
  const beforeB = (
    await f.pool.query(
      'SELECT count(*)::int count FROM products WHERE inventory_id=$1',
      [b.context.inventory.id],
    )
  ).rows[0].count;
  assert.equal((await f.request(a.cookie, key)).statusCode, 202);
  await f.purge(key);
  for (const table of [
    'products',
    'inventory_states',
    'inventory_movements',
    'sale_items',
    'sales',
    'purchases',
    'stock_adjustments',
    'inventory_change_sets',
  ]) {
    assert.equal(
      (
        await f.pool.query(
          `SELECT count(*)::int count FROM ${table} WHERE inventory_id=$1`,
          [a.context.inventory.id],
        )
      ).rows[0].count,
      0,
    );
  }
  for (const table of ['operation_receipts', 'sync_devices', 'import_sessions'])
    assert.equal(
      (
        await f.pool.query(
          `SELECT count(*)::int count FROM ${table} WHERE business_id=$1`,
          [a.context.business.id],
        )
      ).rows[0].count,
      0,
    );
  assert.equal(
    (
      await f.pool.query('SELECT id FROM verification WHERE value=$1', [
        a.authenticated.user.id,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await f.pool.query('SELECT id FROM account WHERE user_id=$1', [
        a.authenticated.user.id,
      ])
    ).rowCount,
    0,
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
    (
      await f.pool.query(
        'SELECT count(*)::int count FROM products WHERE inventory_id=$1',
        [b.context.inventory.id],
      )
    ).rows[0].count,
    beforeB,
  );
  assert.ok((await f.session(b.cookie)).json());
  const row = (
    await f.pool.query('SELECT * FROM deletion_requests WHERE id=$1', [key])
  ).rows[0];
  assert.equal(row.user_id, null);
  assert.equal(row.status, 'COMPLETED');
  assert.deepEqual(row.progress, { phase: 'FINALIZE', attempts: 1 });
  assert.doesNotMatch(
    JSON.stringify(row),
    new RegExp(
      `${a.email}|${a.authenticated.user.id}|${a.context.inventory.id}|${a.context.business.id}`,
    ),
  );
});

test('worker failure at every write rolls back that phase and durable retries complete without relaxed assertions', async (t) => {
  const f = await deletionFixture(t),
    a = await f.owner('failures'),
    key = id();
  await f.history(a.context, 'failures');
  await f.post('request-password-reset', { email: a.email });
  await f.request(a.cookie, key);
  for (const phaseSteps of [
    ['sessions', 'phase:REVOKE'],
    ['imports', 'changes', 'receipts', 'devices', 'phase:PURGE_DELIVERY'],
    [
      'adjustments',
      'states',
      'movements',
      'items',
      'sales',
      'purchases',
      'products',
      'inventory',
      'business',
      'phase:PURGE_DATASET',
    ],
    [
      'auth-sessions',
      'accounts',
      'verifications',
      'security',
      'user',
      'phase:PURGE_AUTH',
    ],
    ['phase:FINALIZE'],
  ]) {
    for (const step of phaseSteps)
      await t.test(step, async () => {
        const claim = await claimDeletion(f.db, Date.now, [], key);
        assert.ok(claim);
        await assert.rejects(
          advanceDeletion(f.db, claim, f.keys, Date.now, async (at) => {
            if (at === step) throw new Error('fictional injection');
          }),
          /fictional injection/,
        );
        const failed = (
          await f.pool.query(
            'SELECT status,progress FROM deletion_requests WHERE id=$1',
            [key],
          )
        ).rows[0];
        assert.equal(failed.status, 'PROCESSING');
        await releaseFailedDeletion(f.db, claim);
        assert.equal(
          (
            await f.pool.query(
              'SELECT status FROM deletion_requests WHERE id=$1',
              [key],
            )
          ).rows[0].status,
          'REQUESTED',
        );
      });
    const claim = await claimDeletion(f.db, Date.now, [], key);
    assert.ok(claim);
    await advanceDeletion(f.db, claim, f.keys);
    if (phaseSteps[0] !== 'phase:FINALIZE')
      await releaseFailedDeletion(f.db, claim);
  }
  assert.equal(
    (
      await f.pool.query('SELECT status FROM deletion_requests WHERE id=$1', [
        key,
      ])
    ).rows[0].status,
    'COMPLETED',
  );
});

test('stale PROCESSING reclaim fences original worker, crash after User delete finalizes on restart', async (t) => {
  const f = await deletionFixture(t),
    a = await f.identity('reclaim'),
    key = id();
  await f.request(a.cookie, key);
  const first = await claimDeletion(f.db, f.clock, [], key);
  assert.ok(first);
  assert.equal(await claimDeletion(f.db, f.clock, [], key), null);
  const later = () => f.clock() + DELETION_LEASE_MS;
  const second = await claimDeletion(f.db, later, [], key);
  assert.ok(second);
  assert.equal(await advanceDeletion(f.db, first, f.keys, later), 'lost');
  for (let i = 0; i < 4; i++)
    assert.equal(
      await advanceDeletion(f.db, second, f.keys, later),
      'continue',
    );
  assert.equal(
    (
      await f.pool.query('SELECT id FROM "user" WHERE id=$1', [
        a.authenticated.user.id,
      ])
    ).rowCount,
    0,
  );
  const restart = createDeletionRunner(f.db, f.keys, {
    clock: () => later() + DELETION_LEASE_MS,
  });
  await restart.sweep();
  await restart.close();
  const completed = (
    await f.pool.query(
      'SELECT status,user_id,progress FROM deletion_requests WHERE id=$1',
      [key],
    )
  ).rows[0];
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.user_id, null);
  assert.equal(completed.progress.attempts, 3);
});

test('runner sanitizes failure, retries next sweep and closes its timer/resources', async (t) => {
  const f = await deletionFixture(t),
    a = await f.identity('runner'),
    key = id();
  await f.request(a.cookie, key);
  let failures = 0,
    inject = true;
  const runner = createDeletionRunner(f.db, f.keys, {
    afterWrite: async () => {
      if (inject) throw new Error('private failure');
    },
    onFailure: () => failures++,
  });
  await runner.sweep();
  assert.equal(failures, 1);
  assert.equal(
    (
      await f.pool.query('SELECT status FROM deletion_requests WHERE id=$1', [
        key,
      ])
    ).rows[0].status,
    'REQUESTED',
  );
  inject = false;
  await runner.sweep();
  assert.equal(
    (
      await f.pool.query('SELECT status FROM deletion_requests WHERE id=$1', [
        key,
      ])
    ).rows[0].status,
    'COMPLETED',
  );
  runner.start();
  await runner.close();
  await runner.sweep();
});
