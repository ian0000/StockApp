import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readServerConfig, readUatBootstrapPolicy } from '../src/config.js';

test('automatic cloud access is opt-in and restricted to the exact Railway UAT', () => {
  const uat = {
    UAT_AUTO_ENABLE_CLOUD_ACCESS: 'true',
    RAILWAY_ENVIRONMENT_NAME: 'uat',
    APP_ORIGIN: 'https://stockapp-staging.ian-k.dev',
    AUTH_BASE_URL: 'https://api-stockapp-staging.ian-k.dev',
  };
  assert.deepEqual(readUatBootstrapPolicy({}), {
    autoEnableCloudAccess: false,
  });
  assert.deepEqual(
    readUatBootstrapPolicy({ UAT_AUTO_ENABLE_CLOUD_ACCESS: 'false' }),
    {
      autoEnableCloudAccess: false,
    },
  );
  assert.deepEqual(readUatBootstrapPolicy(uat), {
    autoEnableCloudAccess: true,
  });
  for (const override of [
    { UAT_AUTO_ENABLE_CLOUD_ACCESS: '' },
    { UAT_AUTO_ENABLE_CLOUD_ACCESS: '1' },
    { UAT_AUTO_ENABLE_CLOUD_ACCESS: 'TRUE' },
    { RAILWAY_ENVIRONMENT_NAME: undefined },
    { RAILWAY_ENVIRONMENT_NAME: 'production' },
    { APP_ORIGIN: 'https://stockapp.ian-k.dev' },
    { AUTH_BASE_URL: 'https://api-stockapp.ian-k.dev' },
  ])
    assert.throws(
      () => readUatBootstrapPolicy({ ...uat, ...override }),
      TypeError,
    );
});

test('importing the entrypoint does not install server signal handlers', async () => {
  const before = [
    process.listenerCount('SIGINT'),
    process.listenerCount('SIGTERM'),
  ];
  const { startServer } = await import('../src/server.js');
  assert.equal(typeof startServer, 'function');
  assert.deepEqual(
    [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')],
    before,
  );
});

test('server configuration has local defaults and accepts explicit bind/port', () => {
  assert.deepEqual(readServerConfig({}), { host: '0.0.0.0', port: 3001 });
  assert.deepEqual(readServerConfig({ HOST: '127.0.0.1', PORT: '43127' }), {
    host: '127.0.0.1',
    port: 43127,
  });
});

test('invalid bind/ports fail before listen without echoing input', () => {
  for (const port of ['', '-1', '0', '65536', '1.5', '1e3', 'secret']) {
    assert.throws(() => readServerConfig({ PORT: port }), TypeError);
  }
  assert.throws(() => readServerConfig({ HOST: ' ' }), TypeError);
});
