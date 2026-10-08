import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import {
  createProvisioningGate,
  withProvisioningGate,
} from './helpers/provisioning-gate.js';

test('provisioning queues requests until the existing lease is released', async (t) => {
  const gate = await createProvisioningGate();
  t.after(() => gate.close());
  const env = {
    TEST_PROVISIONING_URL: gate.url,
    TEST_PROVISIONING_TOKEN: gate.token,
  };
  let releaseFirst!: () => void;
  const hold = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let enteredFirst!: () => void;
  const firstEntered = new Promise<void>((resolve) => {
    enteredFirst = resolve;
  });
  let firstFinished = false;
  const first = withProvisioningGate(async () => {
    enteredFirst();
    await hold;
    firstFinished = true;
  }, env);
  await firstEntered;
  const requestedSecond = once(gate.server, 'request');
  let secondEntered = false;
  const second = withProvisioningGate(async () => {
    assert.equal(firstFinished, true);
    secondEntered = true;
  }, env);
  await requestedSecond;
  assert.equal(secondEntered, false);
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(secondEntered, true);
});

test('provisioning errors propagate and release the lease for the next fixture', async (t) => {
  const gate = await createProvisioningGate();
  t.after(() => gate.close());
  const env = {
    TEST_PROVISIONING_URL: gate.url,
    TEST_PROVISIONING_TOKEN: gate.token,
  };
  const failure = new Error('Fixture setup failed.');
  await assert.rejects(
    withProvisioningGate(async () => {
      throw failure;
    }, env),
    (error) => error === failure,
  );
  assert.equal(await withProvisioningGate(async () => 42, env), 42);
});
