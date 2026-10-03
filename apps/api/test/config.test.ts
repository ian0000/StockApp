import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readServerConfig } from '../src/config.js';

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
