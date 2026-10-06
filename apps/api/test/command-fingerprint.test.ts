import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import {
  createSchemaValidator,
  operationReceiptSchema,
} from '@stock-app/contracts';
import {
  commandFingerprint,
  requireIdempotencyKey,
} from '../src/commands/fingerprint.js';
import { CommandError } from '../src/commands/errors.js';
import { buildApp } from '../src/app.js';
import {
  acceptedReferencesSchemas,
  terminalReferencesSchemas,
} from '../src/infrastructure/postgres/command-receipts.js';
import { purchaseCommand } from './helpers/commands.js';
import { id } from './postgres/helpers.js';

const inventoryId = '550e8400-e29b-41d4-a716-446655440001';
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reverseKeys(child)]),
    );
  return value;
}

test('fingerprint is canonical SHA-256 with domain and Inventory separation, preserving JSON values', () => {
  const command = purchaseCommand();
  const hash = commandFingerprint(inventoryId, command);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(commandFingerprint(inventoryId, reverseKeys(command)), hash);
  assert.equal(
    commandFingerprint(inventoryId, JSON.parse(JSON.stringify(command))),
    hash,
  );
  assert.notEqual(commandFingerprint(id(), command), hash);
  assert.notEqual(
    commandFingerprint(inventoryId, {
      ...command,
      payload: { ...command.payload, quantity: 2 },
    }),
    hash,
  );
  assert.notEqual(
    commandFingerprint(inventoryId, {
      ...command,
      payload: { ...command.payload, notes: 'Memo' },
    }),
    commandFingerprint(inventoryId, {
      ...command,
      payload: { ...command.payload, notes: 'memo' },
    }),
  );
  const dependencies = [id(), id()];
  assert.notEqual(
    commandFingerprint(inventoryId, { ...command, dependsOn: dependencies }),
    commandFingerprint(inventoryId, {
      ...command,
      dependsOn: [...dependencies].reverse(),
    }),
  );
  const { deviceId: _deviceId, ...missingDevice } = command;
  assert.notEqual(commandFingerprint(inventoryId, missingDevice), hash);
  const { notes: _notes, ...missingNotes } = command.payload;
  assert.throws(
    () =>
      commandFingerprint(inventoryId, { ...command, payload: missingNotes }),
    TypeError,
  );
  assert.throws(
    () => commandFingerprint(inventoryId, { ...command, protocolVersion: 2 }),
    TypeError,
  );
  assert.throws(
    () =>
      commandFingerprint(inventoryId, {
        ...command,
        payload: { ...command.payload, unitCost: '00' },
      }),
    TypeError,
  );
  assert.throws(
    () =>
      commandFingerprint(inventoryId, { ...command, session: 'unexpected' }),
    TypeError,
  );
  assert.throws(() => commandFingerprint('not-a-UUID', command), TypeError);
});

test('fingerprint remains identical in a fresh Node runtime', async () => {
  const command = purchaseCommand();
  const child = spawn(
    process.execPath,
    [
      '--conditions=development',
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      "import {commandFingerprint} from './src/commands/fingerprint.ts'; let text=''; for await (const chunk of process.stdin) text+=chunk; const {inventoryId,command}=JSON.parse(text); process.stdout.write(commandFingerprint(inventoryId,command));",
    ],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let output = '',
    diagnostic = '';
  child.stdout.on('data', (value) => {
    output += String(value);
  });
  child.stderr.on('data', (value) => {
    diagnostic += String(value);
  });
  child.stdin.end(JSON.stringify({ inventoryId, command }));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  assert.equal(code, 0, diagnostic);
  assert.equal(output, commandFingerprint(inventoryId, command));
});

test('Idempotency-Key helper requires valid v7 equality, allowing header case differences only', () => {
  const command = purchaseCommand();
  requireIdempotencyKey(command.operationId, command);
  requireIdempotencyKey(command.operationId.toUpperCase(), command);
  for (const header of [
    undefined,
    '',
    'not-a-UUID',
    inventoryId,
    id(),
    [command.operationId],
    `${command.operationId}\n`,
  ])
    assert.throws(
      () => requireIdempotencyKey(header, command),
      (error) =>
        error instanceof CommandError &&
        error.statusCode === 400 &&
        error.code === 'VALIDATION_ERROR',
    );
});

test('internal references have strict per-kind identities and terminal allowlists without requestId/payload', () => {
  for (const [kind, schema] of Object.entries(acceptedReferencesSchemas)) {
    const field = schema.required[0];
    assert.ok(field);
    const value = { [field]: id() };
    const validate = createSchemaValidator(schema);
    validate(value);
    assert.throws(() => validate({ ...value, requestId: 'old' }), TypeError);
    assert.throws(() => validate({ ...value, payload: {} }), TypeError);
    assert.throws(() => validate({ [field]: 'not-a-UUID' }), TypeError);
    if (
      [
        'PRODUCT_CREATE',
        'SALE_REGISTER',
        'PURCHASE_REGISTER',
        'STOCK_ADJUST',
      ].includes(kind)
    )
      assert.throws(() => validate({ [field]: inventoryId }), TypeError);
    else validate({ [field]: inventoryId });
  }
  const conflict = createSchemaValidator(terminalReferencesSchemas.CONFLICT);
  conflict({
    errorCode: 'REVISION_CONFLICT',
    currentRevision: '9007199254740993',
  });
  conflict({ errorCode: 'COST_SNAPSHOT_CONFLICT' });
  for (const value of [
    { errorCode: 'COST_SNAPSHOT_CONFLICT', currentRevision: '1' },
    { errorCode: 'REVISION_CONFLICT', requestId: 'old' },
    { errorCode: 'INTERNAL_ERROR' },
    { errorCode: 'TEMPORARILY_UNAVAILABLE' },
    { errorCode: 'IDEMPOTENCY_KEY_REUSED' },
    { errorCode: 'VALIDATION_ERROR' },
    { errorCode: 'REVISION_CONFLICT', details: { stack: 'secret' } },
  ])
    assert.throws(() => conflict(value), TypeError);
  const rejected = createSchemaValidator(terminalReferencesSchemas.REJECTED);
  rejected({ errorCode: 'DOMAIN_RULE' });
  assert.throws(
    () => rejected({ errorCode: 'DOMAIN_RULE', currentRevision: '1' }),
    TypeError,
  );
  assert.throws(() => rejected({ errorCode: 'DEPENDENCY_BLOCKED' }), TypeError);
});

test('runtime maps reused intent to sanitized 409 with the current requestId', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  app.addHook('preHandler', async () => {
    throw new CommandError(409, 'IDEMPOTENCY_KEY_REUSED');
  });
  const response = await app.inject('/live');
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(
    response.json().error.requestId,
    response.headers['x-request-id'],
  );
  assert.doesNotThrow(() =>
    createSchemaValidator(operationReceiptSchema)({
      operationId: id(),
      status: 'REJECTED',
      error: {
        code: 'DOMAIN_RULE',
        message: 'Revisa los datos.',
        requestId: 'current',
      },
    }),
  );
});
