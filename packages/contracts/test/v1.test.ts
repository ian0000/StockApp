import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  COMMAND_KINDS,
  DOMAIN_VERSION,
  PROTOCOL_VERSION,
  apiErrorSchema,
  commandEnvelopeSchema,
  createSchemaValidator,
  decodeCommandEnvelope,
  decodePercentage,
  decodePushRequest,
  decodeUuid,
  encodePercentage,
  moneySchema,
  percentageSchema,
  revisionSchema,
  timestampSchema,
  uuidV7Schema,
  type CommandEnvelopeV1,
} from '../src/index.js';
import { contractSchemas, routeContracts } from '../src/routes.js';
import {
  assertOpenApiCurrent,
  generateOpenApi,
  serializeOpenApi,
} from '../src/openapi.js';

function id(index: number): string {
  return `019a0000-0000-7000-8000-${index.toString(16).padStart(12, '0')}`;
}
const expectedState = { stock: -2, unitCost: '0', lastMovementId: id(90) };
const statePreconditions = {
  expectedStateRevision: '9007199254740993',
  expectedState,
};
const fields = {
  name: 'Producto',
  variant: null,
  barcode: '001',
  regularSalePrice: '0',
  minimumStock: null,
};
const payloads = {
  PRODUCT_CREATE: {
    productId: id(1),
    initialMovementId: id(2),
    createdAt: 100,
    ...fields,
    initialStock: 2,
    initialUnitCost: '0',
  },
  PRODUCT_UPDATE: { productId: id(1), ...fields },
  PRODUCT_ARCHIVE: { productId: id(1) },
  SALE_REGISTER: {
    saleId: id(3),
    createdAt: 100,
    items: [
      {
        productId: id(1),
        saleItemId: id(4),
        movementId: id(5),
        quantity: 2,
        unitSalePrice: '1000000',
      },
    ],
    notes: null,
  },
  PURCHASE_REGISTER: {
    purchaseId: id(6),
    movementId: id(7),
    createdAt: 100,
    productId: id(1),
    quantity: 2,
    unitCost: '0',
    notes: null,
  },
  STOCK_ADJUST: {
    stockAdjustmentId: id(8),
    movementId: id(9),
    createdAt: 100,
    productId: id(1),
    actualStock: 0,
    reason: 'COUNT_CORRECTION',
    costMode: null,
    customUnitCost: null,
  },
  SALE_VOID: {
    saleId: id(3),
    createdAt: 100,
    reversalMovements: [{ productId: id(1), movementId: id(10) }],
  },
  PURCHASE_VOID: {
    purchaseId: id(6),
    createdAt: 100,
    reversalMovementId: id(11),
  },
} as const;
function command(kind: (typeof COMMAND_KINDS)[number]) {
  const preconditions =
    kind === 'PRODUCT_CREATE'
      ? {}
      : kind === 'PRODUCT_UPDATE' || kind === 'PRODUCT_ARCHIVE'
        ? { expectedMetadataRevision: '10' }
        : kind === 'SALE_REGISTER'
          ? {
              expectedCosts: [
                {
                  productId: id(1),
                  unitCostSnapshot: null,
                  estimatedCost: null,
                  estimatedProfit: null,
                },
              ],
            }
          : kind === 'SALE_VOID'
            ? { states: [{ productId: id(1), ...statePreconditions }] }
            : statePreconditions;
  return {
    protocolVersion: PROTOCOL_VERSION,
    domainVersion: DOMAIN_VERSION,
    commandKind: kind,
    operationId: id(80),
    occurredAt: 50,
    dependsOn: [],
    payload: payloads[kind],
    preconditions,
  };
}

test('all eight frozen command variants round-trip without regenerating identity or commercial time', () => {
  for (const kind of COMMAND_KINDS) {
    const value = command(kind);
    assert.deepEqual(
      decodeCommandEnvelope(JSON.parse(JSON.stringify(value))),
      value,
    );
  }
  const decoded: CommandEnvelopeV1 = decodeCommandEnvelope(
    command('SALE_REGISTER'),
  );
  if (decoded.commandKind === 'SALE_REGISTER') {
    assert.equal(decoded.payload.saleId, id(3));
    // @ts-expect-error A sale payload cannot be treated as a purchase payload.
    void decoded.payload.purchaseId;
  }
});

test('strict commands reject unknown properties, missing identity, versions and wrong-kind payloads', () => {
  const value = command('SALE_REGISTER');
  for (const invalid of [
    { ...value, ownerId: id(99) },
    { ...value, protocolVersion: 2 },
    { ...value, domainVersion: 2 },
    { ...value, operationId: undefined },
    { ...value, payload: payloads.PURCHASE_REGISTER },
    { ...value, payload: { ...payloads.SALE_REGISTER, stock: 100 } },
    {
      ...value,
      payload: {
        ...payloads.SALE_REGISTER,
        items: [{ ...payloads.SALE_REGISTER.items[0], quantity: 0 }],
      },
    },
    {
      ...value,
      payload: {
        ...payloads.SALE_REGISTER,
        items: [{ ...payloads.SALE_REGISTER.items[0], unitSalePrice: '0' }],
      },
    },
  ])
    assert.throws(() => decodeCommandEnvelope(invalid), TypeError);
});

test('duplicate new IDs and repeated products fail at the boundary', () => {
  const value = command('SALE_REGISTER');
  const line = payloads.SALE_REGISTER.items[0];
  assert.throws(
    () =>
      decodeCommandEnvelope({
        ...value,
        payload: {
          ...payloads.SALE_REGISTER,
          items: [{ ...line, movementId: line.saleItemId }],
        },
      }),
    TypeError,
  );
  assert.throws(
    () =>
      decodeCommandEnvelope({
        ...value,
        payload: {
          ...payloads.SALE_REGISTER,
          items: [line, { ...line, saleItemId: id(60), movementId: id(61) }],
        },
      }),
    TypeError,
  );
  assert.throws(
    () => decodeCommandEnvelope({ ...value, operationId: line.saleItemId }),
    TypeError,
  );
});

test('initial stock, evidence correspondence and null/zero stay explicit', () => {
  assert.throws(
    () =>
      decodeCommandEnvelope({
        ...command('PURCHASE_REGISTER'),
        preconditions: {
          ...statePreconditions,
          expectedState: { ...expectedState, unitCost: '-1' },
        },
      }),
    TypeError,
  );
  assert.throws(
    () =>
      decodeCommandEnvelope({
        ...command('PRODUCT_CREATE'),
        payload: { ...payloads.PRODUCT_CREATE, initialMovementId: null },
      }),
    TypeError,
  );
  assert.throws(
    () =>
      decodeCommandEnvelope({
        ...command('PRODUCT_CREATE'),
        payload: { ...payloads.PRODUCT_CREATE, initialUnitCost: null },
      }),
    TypeError,
  );
  assert.throws(
    () =>
      decodeCommandEnvelope({
        ...command('SALE_REGISTER'),
        preconditions: {
          expectedCosts: [
            {
              productId: id(1),
              unitCostSnapshot: null,
              estimatedCost: '0',
              estimatedProfit: null,
            },
          ],
        },
      }),
    TypeError,
  );
  assert.throws(
    () =>
      decodeCommandEnvelope({
        ...command('SALE_VOID'),
        preconditions: {
          states: [{ productId: id(99), ...statePreconditions }],
        },
      }),
    TypeError,
  );
});

test('receipt references require declared parents and self-dependency is rejected', () => {
  const value = command('PURCHASE_REGISTER');
  const preconditions = {
    ...statePreconditions,
    expectedStateRevision: { operationId: id(70) },
  };
  assert.throws(
    () => decodeCommandEnvelope({ ...value, preconditions }),
    TypeError,
  );
  assert.doesNotThrow(() =>
    decodeCommandEnvelope({ ...value, dependsOn: [id(70)], preconditions }),
  );
  assert.throws(
    () => decodeCommandEnvelope({ ...value, dependsOn: [value.operationId] }),
    TypeError,
  );
  assert.throws(
    () =>
      decodeCommandEnvelope({
        ...value,
        supersedesOperationId: value.operationId,
      }),
    TypeError,
  );
});

test('sync requires matching device, unique intentions, strict envelope and max 50 commands', () => {
  const deviceId = id(75);
  const value = { ...command('PRODUCT_ARCHIVE'), deviceId };
  assert.equal(
    decodePushRequest({ deviceId, commands: [value] }).commands.length,
    1,
  );
  for (const commands of [
    [command('PRODUCT_ARCHIVE')],
    [value, value],
    Array.from({ length: 51 }, () => value),
  ])
    assert.throws(() => decodePushRequest({ deviceId, commands }), TypeError);
});

test('Money/Percentage schemas agree with safe scaled codecs, including negative percentage points', () => {
  for (const schema of [moneySchema, percentageSchema]) {
    const validate = createSchemaValidator(schema);
    for (const units of [
      0,
      -1,
      10666666,
      12345678,
      Number.MIN_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
    ]) {
      assert.doesNotThrow(() => validate(encodePercentage(units)));
      assert.equal(decodePercentage(encodePercentage(units)), units);
    }
    for (const value of [
      '-0',
      '01',
      '+1',
      '1.2',
      '1e6',
      '1\n',
      '9007199254740992',
      '-9007199254740992',
      null,
      1,
    ])
      assert.throws(() => validate(value), TypeError);
  }
});

test('revision remains unbounded canonical string and timestamp remains safe epoch number', () => {
  const revision = createSchemaValidator(revisionSchema);
  assert.doesNotThrow(() =>
    revision('999999999999999999999999999999999999999'),
  );
  for (const value of ['01', '-1', 1])
    assert.throws(() => revision(value), TypeError);
  const timestamp = createSchemaValidator(timestampSchema);
  assert.doesNotThrow(() => timestamp(0));
  for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '100'])
    assert.throws(() => timestamp(value), TypeError);
});

test('UUID is separate from UUIDv7; auth identity remains opaque', () => {
  const v4 = 'd9fc41f7-d094-4446-89b9-934c48bd06f0';
  assert.equal(decodeUuid(v4), v4);
  assert.equal(decodeUuid(id(1), 7), id(1));
  assert.throws(() => decodeUuid(v4, 7), TypeError);
  const me = createSchemaValidator(contractSchemas.Me);
  assert.doesNotThrow(() =>
    me({
      user: {
        id: 'betterauth_opaque_id',
        email: 'user@example.test',
        emailVerified: true,
      },
      business: null,
      inventory: null,
      capabilities: { protocolVersions: [1], domainVersions: [1] },
    }),
  );
});

test('error details only allow scoped currentRevision for REVISION_CONFLICT', () => {
  const validate = createSchemaValidator(apiErrorSchema);
  const error = {
    code: 'REVISION_CONFLICT',
    message: 'Revisa los datos.',
    requestId: 'request',
    details: { currentRevision: '9007199254740993' },
  };
  assert.doesNotThrow(() => validate({ error }));
  for (const invalid of [
    { ...error, code: 'INTERNAL_ERROR' },
    { ...error, details: { currentRevision: '1', sql: 'private' } },
    { ...error, details: { currentRevision: 1 } },
  ])
    assert.throws(() => validate({ error: invalid }), TypeError);
});

test('tombstones cannot delete archived products or VOIDED operations', () => {
  const validate = createSchemaValidator(contractSchemas.ChangeSet);
  const upserts = {
    products: [],
    inventoryStates: [],
    sales: [],
    saleItems: [],
    purchases: [],
    stockAdjustments: [],
    inventoryMovements: [],
  };
  const value = {
    inventoryId: id(1),
    revision: '1',
    serverRecordedAt: 100,
    upserts,
    tombstones: [],
  };
  assert.doesNotThrow(() => validate(value));
  assert.throws(
    () => validate({ ...value, tombstones: [{ type: 'Product', id: id(2) }] }),
    TypeError,
  );
});

test('read DTOs preserve known-zero versus unknown snapshots and reject missing/extra fields', () => {
  const validate = createSchemaValidator(contractSchemas.SaleItem);
  const common = {
    id: id(1),
    inventoryId: id(2),
    saleId: id(3),
    productId: id(4),
    quantity: 1,
    unitSalePrice: '1000000',
    subtotal: '1000000',
    createdAt: 100,
    updatedAt: 100,
  };
  assert.doesNotThrow(() =>
    validate({
      ...common,
      costStatus: 'KNOWN',
      unitCostSnapshot: '0',
      estimatedCost: '0',
      estimatedProfit: '1000000',
    }),
  );
  assert.doesNotThrow(() =>
    validate({
      ...common,
      costStatus: 'UNKNOWN',
      unitCostSnapshot: null,
      estimatedCost: null,
      estimatedProfit: null,
    }),
  );
  for (const invalid of [
    {
      ...common,
      costStatus: 'UNKNOWN',
      unitCostSnapshot: null,
      estimatedCost: '0',
      estimatedProfit: null,
    },
    {
      ...common,
      costStatus: 'KNOWN',
      unitCostSnapshot: '0',
      estimatedCost: '0',
    },
    {
      ...common,
      costStatus: 'KNOWN',
      unitCostSnapshot: '-1',
      estimatedCost: '0',
      estimatedProfit: '0',
    },
    {
      ...common,
      costStatus: 'UNKNOWN',
      unitCostSnapshot: null,
      estimatedCost: null,
      estimatedProfit: null,
      secret: 'forbidden',
    },
  ])
    assert.throws(() => validate(invalid), TypeError);
});

test('pagination, import metadata, lifecycle and backup V1 reject loose transport objects', () => {
  const pagination = createSchemaValidator(contractSchemas.PaginationQuery);
  assert.doesNotThrow(() => pagination({ limit: 100, cursor: 'opaque' }));
  assert.throws(() => pagination({ limit: 101 }), TypeError);
  assert.throws(
    () => createSchemaValidator(contractSchemas.HistoryQuery)({ limit: 51 }),
    TypeError,
  );
  const importReservation = createSchemaValidator(
    contractSchemas.ImportReservation,
  );
  const reservation = {
    inventoryId: id(1),
    backup: { format: 'stockapp-backup', formatVersion: 1 },
    sha256: 'a'.repeat(64),
    totalBytes: 100,
    chunkCount: 1,
    consent: true,
  };
  assert.doesNotThrow(() => importReservation(reservation));
  assert.throws(
    () => importReservation({ ...reservation, consent: false }),
    TypeError,
  );
  assert.throws(
    () => importReservation({ ...reservation, backup: { arbitrary: {} } }),
    TypeError,
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.ImportChunk)({
        sha256: 'a'.repeat(64),
        byteLength: 1,
        contents: {},
      }),
    TypeError,
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.AccountDeletionRequest)({
        userId: 'foreign',
      }),
    TypeError,
  );
  const backup = {
    format: 'stockapp-backup',
    formatVersion: 1,
    createdAt: 0,
    inventoryId: 'local-legacy-id',
    data: {
      inventories: [],
      products: [],
      inventoryStates: [],
      inventoryMovements: [],
      sales: [],
      saleItems: [],
      purchases: [],
      stockAdjustments: [],
    },
  };
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.BackupV1)(backup),
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.BackupV1)({
        ...backup,
        data: { ...backup.data, purchaseItems: [] },
      }),
    TypeError,
  );
});

test('OpenAPI is reproducible, references resolve, only five routes are implemented and stale artifacts fail', async () => {
  const artifact = await readFile(
    new URL('../../../docs/web/openapi/stockapp-v1.json', import.meta.url),
    'utf8',
  );
  assertOpenApiCurrent(artifact);
  assert.equal(serializeOpenApi(), serializeOpenApi());
  assert.throws(() => assertOpenApiCurrent(`${artifact} `), /stale/);
  const document = generateOpenApi();
  assert.equal(document.openapi, '3.1.1');
  assert.equal(document.info.title, 'StockApp API');
  assert.equal(
    routeContracts.filter(
      (route) => route.implementationStatus === 'implemented',
    ).length,
    5,
  );
  assert.equal(
    document.paths['/health']?.get?.['x-stockapp-implementation-status'],
    'planned',
  );
  for (const route of routeContracts) {
    const operation = document.paths[route.path]?.[route.method];
    assert.ok(operation);
    assert.equal(operation.operationId, route.operationId);
    const paths = [...route.path.matchAll(/\{([^}]+)\}/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(
      operation.parameters
        .filter((parameter) => parameter.in === 'path')
        .map((parameter) => parameter.name),
      paths,
    );
    if (route.command)
      assert.ok(
        operation.parameters.some(
          (parameter) =>
            parameter.name === 'Idempotency-Key' && parameter.required,
        ),
      );
  }
  assert.equal(commandEnvelopeSchema.oneOf.length, 8);
  assert.doesNotThrow(() => createSchemaValidator(uuidV7Schema)(id(1)));
});
