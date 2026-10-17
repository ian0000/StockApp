import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authFixture } from '../auth/helpers.js';
import { insertFixtureUser } from '../postgres/helpers.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { bootstrapEmptyInventory } from '../../src/ownership/bootstrap.js';
import { setPilotAccess } from '../../src/ownership/pilot.js';
import { readUatBootstrapPolicy } from '../../src/config.js';

test('UAT verified bootstrap activates only a new own inventory, preserving security and administrative disables', async (t) => {
  const f = await authFixture(t);
  const database = createDatabase(f.pool);
  const policy = readUatBootstrapPolicy({
    UAT_AUTO_ENABLE_CLOUD_ACCESS: 'true',
    RAILWAY_ENVIRONMENT_NAME: 'uat',
    APP_ORIGIN: 'https://stockapp-staging.ian-k.dev',
    AUTH_BASE_URL: 'https://api-stockapp-staging.ian-k.dev',
  });
  registerOwnershipRoutes(f.app, f.runtime.auth, database, Date.now, policy);
  const input = {
    inventoryName: 'UAT synthetic inventory',
    currency: 'USD',
    reportingTimeZone: 'America/Guayaquil',
  };
  const anonymous = await f.app.inject({
    method: 'POST',
    url: '/v1/business',
    payload: input,
  });
  assert.equal(anonymous.statusCode, 401);
  await insertFixtureUser(f.pool, 'uat-unverified', false);
  await assert.rejects(
    bootstrapEmptyInventory(
      database,
      'uat-unverified',
      input,
      Date.now,
      policy,
    ),
    { statusCode: 403, code: 'EMAIL_NOT_VERIFIED' },
  );
  assert.equal((await f.pool.query('SELECT id FROM businesses')).rowCount, 0);

  await f.signup('uat-owner@example.test');
  await f.verify('uat-owner@example.test');
  const owner = await f.signin('uat-owner@example.test');
  const cookie = owner.cookie;
  const noCsrf = await f.app.inject({
    method: 'POST',
    url: '/v1/business',
    headers: { cookie },
    payload: input,
  });
  assert.equal(noCsrf.statusCode, 403);
  const token = (
    await f.app.inject({ url: '/v1/session/csrf', headers: { cookie } })
  ).json().token;
  const bootstrap = (payload: unknown = input) =>
    f.app.inject({
      method: 'POST',
      url: '/v1/business',
      headers: {
        cookie,
        'x-csrf-token': token,
        'content-type': 'application/json',
      },
      payload: JSON.stringify(payload),
    });
  // The browser cannot select or override the deployment policy.
  const spoofed = await bootstrap({ ...input, cloudAccessEnabled: true });
  assert.equal(spoofed.statusCode, 400);
  const created = await bootstrap();
  assert.equal(created.statusCode, 201, created.body);
  const dataset = created.json();
  assert.equal(dataset.business.cloudAccessEnabled, true);
  assert.equal(created.headers['cache-control'], 'no-store');
  const inventoryUrl = `/v1/inventories/${dataset.inventory.id}`;
  assert.equal(
    (await f.app.inject({ url: inventoryUrl, headers: { cookie } })).statusCode,
    200,
  );
  const replay = await bootstrap();
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.json(), dataset);
  assert.equal((await f.pool.query('SELECT id FROM businesses')).rowCount, 1);
  assert.equal((await f.pool.query('SELECT id FROM inventories')).rowCount, 1);

  await f.signup('uat-foreign@example.test');
  await f.verify('uat-foreign@example.test');
  const foreign = await f.signin('uat-foreign@example.test');
  assert.equal(
    (
      await f.app.inject({
        url: inventoryUrl,
        headers: { cookie: foreign.cookie },
      })
    ).statusCode,
    404,
  );

  await setPilotAccess(database, owner.result.json().user.id, false);
  const disabledReplay = await bootstrap();
  assert.equal(disabledReplay.statusCode, 200);
  assert.equal(disabledReplay.json().business.cloudAccessEnabled, false);
  const denied = await f.app.inject({ url: inventoryUrl, headers: { cookie } });
  assert.equal(denied.statusCode, 403);
  await f.pool.query("UPDATE businesses SET status='DELETING' WHERE id=$1", [
    dataset.business.id,
  ]);
  const deleting = await bootstrap();
  assert.equal(deleting.statusCode, 409);
  assert.equal(
    (
      await f.pool.query(
        'SELECT cloud_access_enabled FROM businesses WHERE id=$1',
        [dataset.business.id],
      )
    ).rows[0].cloud_access_enabled,
    false,
  );
});
