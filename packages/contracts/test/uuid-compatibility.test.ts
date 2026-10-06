import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSchemaValidator,
  decodeCommandEnvelope,
  decodeUuid,
  uuidSchema,
  uuidV7Schema,
  contractSchemas,
  generateOpenApi,
} from '../src/index.js';

const legacyProduct = '550e8400-e29b-41d4-a716-446655440000';
const legacy = (index: number) =>
  `550e8400-e29b-41d4-a716-${index.toString().padStart(12, '0')}`;
const fresh = (index: number) =>
  `019a0000-0000-7000-8000-${index.toString().padStart(12, '0')}`;
const times = { createdAt: 100, updatedAt: 100 };
const operationTimes = { ...times, effectiveAt: 100 };
const metadata = {
  name: 'Legacy',
  variant: null,
  barcode: null,
  regularSalePrice: '1000000',
  minimumStock: null,
};
const expectedState = { stock: 0, unitCost: '0', lastMovementId: legacy(7) };
const statePreconditions = { expectedStateRevision: '1', expectedState };
const salePreconditions = {
  expectedCosts: [
    {
      productId: legacyProduct,
      unitCostSnapshot: '0',
      estimatedCost: '0',
      estimatedProfit: '2000000',
    },
  ],
};
const voidPreconditions = {
  states: [{ productId: legacyProduct, ...statePreconditions }],
};
function envelope(
  commandKind: string,
  payload: unknown,
  preconditions: unknown,
) {
  return {
    protocolVersion: 1,
    domainVersion: 1,
    operationId: fresh(100),
    occurredAt: 100,
    deviceId: fresh(101),
    dependsOn: [],
    commandKind,
    payload,
    preconditions,
  };
}
const createPayload = {
  ...metadata,
  productId: fresh(1),
  initialMovementId: fresh(2),
  initialStock: 1,
  initialUnitCost: '0',
  createdAt: 100,
};
const salePayload = {
  saleId: fresh(3),
  createdAt: 100,
  items: [
    {
      productId: legacyProduct,
      saleItemId: fresh(4),
      movementId: fresh(5),
      quantity: 2,
      unitSalePrice: '1000000',
    },
  ],
  notes: null,
};
const purchasePayload = {
  purchaseId: fresh(6),
  movementId: fresh(7),
  productId: legacyProduct,
  quantity: 1,
  unitCost: '0',
  notes: null,
  createdAt: 100,
};
const adjustmentPayload = {
  stockAdjustmentId: fresh(8),
  movementId: fresh(9),
  productId: legacyProduct,
  actualStock: 1,
  reason: 'COUNT_CORRECTION',
  costMode: 'USE_CURRENT_COST',
  customUnitCost: null,
  createdAt: 100,
};
const voidSalePayload = {
  saleId: legacy(3),
  reversalMovements: [{ productId: legacyProduct, movementId: fresh(10) }],
  createdAt: 100,
};
const voidPurchasePayload = {
  purchaseId: legacy(6),
  reversalMovementId: fresh(11),
  createdAt: 100,
};
const stored = {
  Product: {
    id: legacyProduct,
    inventoryId: legacy(1),
    ...metadata,
    isArchived: true,
    metadataRevision: '1',
    ...times,
  },
  InventoryState: {
    inventoryId: legacy(1),
    productId: legacyProduct,
    stock: 0,
    unitCost: '0',
    stateRevision: '1',
    lastMovementId: legacy(7),
  },
  Sale: {
    id: legacy(3),
    inventoryId: legacy(1),
    status: 'VOIDED',
    totalAmount: '2000000',
    estimatedCost: '0',
    estimatedProfit: '2000000',
    notes: null,
    ...operationTimes,
  },
  SaleItem: {
    id: legacy(4),
    inventoryId: legacy(1),
    saleId: legacy(3),
    productId: legacyProduct,
    quantity: 2,
    unitSalePrice: '1000000',
    subtotal: '2000000',
    costStatus: 'KNOWN',
    unitCostSnapshot: '0',
    estimatedCost: '0',
    estimatedProfit: '2000000',
    ...times,
  },
  Purchase: {
    id: legacy(6),
    inventoryId: legacy(1),
    productId: legacyProduct,
    quantity: 1,
    unitCost: '0',
    totalAmount: '0',
    stockBefore: 0,
    stockAfter: 1,
    averageCostBefore: null,
    averageCostAfter: '0',
    status: 'VOIDED',
    notes: null,
    ...operationTimes,
  },
  StockAdjustment: {
    id: legacy(8),
    inventoryId: legacy(1),
    productId: legacyProduct,
    stockBefore: 0,
    actualStock: 1,
    difference: 1,
    reason: 'COUNT_CORRECTION',
    costMode: 'USE_CURRENT_COST',
    unitCost: '0',
    ...operationTimes,
  },
  InventoryMovement: {
    id: legacy(7),
    inventoryId: legacy(1),
    productId: legacyProduct,
    type: 'REVERSAL',
    quantityDelta: 2,
    stockBefore: -2,
    stockAfter: 0,
    unitCostSnapshot: '0',
    sourceType: 'INVENTORY_MOVEMENT',
    sourceId: legacy(5),
    reversalOfMovementId: legacy(5),
    metadata: null,
    ...operationTimes,
  },
};

test('generic UUID accepts valid legacy versions and v7 but rejects malformed/non-UUID IDs', () => {
  for (const value of [
    legacyProduct,
    fresh(1),
    '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    '00000000-0000-0000-0000-000000000000',
  ]) {
    assert.doesNotThrow(() => createSchemaValidator(uuidSchema)(value));
    assert.equal(decodeUuid(value), value);
  }
  for (const value of [
    'local-legacy-id',
    '550e8400-e29b-41d4-a716-44665544000',
    `${legacyProduct}\n`,
    '550e8400-e29b-41d4-0716-446655440000',
  ])
    assert.throws(() => createSchemaValidator(uuidSchema)(value), TypeError);
  assert.throws(
    () => createSchemaValidator(uuidV7Schema)(legacyProduct),
    TypeError,
  );
});

test('every reference command accepts legacy UUIDs without regenerating or remapping them', () => {
  const commands = [
    envelope(
      'PRODUCT_UPDATE',
      { productId: legacyProduct, ...metadata },
      { expectedMetadataRevision: '1' },
    ),
    envelope(
      'PRODUCT_ARCHIVE',
      { productId: legacyProduct },
      { expectedMetadataRevision: '1' },
    ),
    envelope('SALE_REGISTER', salePayload, salePreconditions),
    envelope('PURCHASE_REGISTER', purchasePayload, statePreconditions),
    envelope('STOCK_ADJUST', adjustmentPayload, statePreconditions),
    envelope('SALE_VOID', voidSalePayload, voidPreconditions),
    envelope('PURCHASE_VOID', voidPurchasePayload, statePreconditions),
  ];
  for (const command of commands)
    assert.deepEqual(
      decodeCommandEnvelope(JSON.parse(JSON.stringify(command))),
      command,
    );
  const uppercase = envelope(
    'PRODUCT_ARCHIVE',
    { productId: legacyProduct.toUpperCase() },
    { expectedMetadataRevision: '1' },
  );
  assert.deepEqual(decodeCommandEnvelope(uppercase), uppercase);
  assert.throws(
    () =>
      decodeCommandEnvelope(
        envelope(
          'PRODUCT_UPDATE',
          { productId: 'local-not-a-UUID', ...metadata },
          { expectedMetadataRevision: '1' },
        ),
      ),
    TypeError,
  );
  const sale = decodeCommandEnvelope(commands[2]);
  assert.equal(sale.commandKind, 'SALE_REGISTER');
  if (sale.commandKind === 'SALE_REGISTER')
    assert.equal(sale.payload.items[0]?.productId, legacyProduct);
});

test('all newly created entity IDs remain UUIDv7, including every movement and reversal', () => {
  assert.doesNotThrow(() =>
    decodeCommandEnvelope(envelope('PRODUCT_CREATE', createPayload, {})),
  );
  const invalid = [
    envelope(
      'PRODUCT_CREATE',
      { ...createPayload, productId: legacyProduct },
      {},
    ),
    envelope(
      'PRODUCT_CREATE',
      { ...createPayload, initialMovementId: legacyProduct },
      {},
    ),
    envelope(
      'SALE_REGISTER',
      { ...salePayload, saleId: legacyProduct },
      salePreconditions,
    ),
    envelope(
      'SALE_REGISTER',
      {
        ...salePayload,
        items: [{ ...salePayload.items[0], saleItemId: legacy(20) }],
      },
      salePreconditions,
    ),
    envelope(
      'SALE_REGISTER',
      {
        ...salePayload,
        items: [{ ...salePayload.items[0], movementId: legacy(20) }],
      },
      salePreconditions,
    ),
    envelope(
      'PURCHASE_REGISTER',
      { ...purchasePayload, purchaseId: legacy(20) },
      statePreconditions,
    ),
    envelope(
      'PURCHASE_REGISTER',
      { ...purchasePayload, movementId: legacy(20) },
      statePreconditions,
    ),
    envelope(
      'STOCK_ADJUST',
      { ...adjustmentPayload, stockAdjustmentId: legacy(20) },
      statePreconditions,
    ),
    envelope(
      'STOCK_ADJUST',
      { ...adjustmentPayload, movementId: legacy(20) },
      statePreconditions,
    ),
    envelope(
      'SALE_VOID',
      {
        ...voidSalePayload,
        reversalMovements: [
          { productId: legacyProduct, movementId: legacy(20) },
        ],
      },
      voidPreconditions,
    ),
    envelope(
      'PURCHASE_VOID',
      { ...voidPurchasePayload, reversalMovementId: legacy(20) },
      statePreconditions,
    ),
  ];
  for (const command of invalid)
    assert.throws(() => decodeCommandEnvelope(command), TypeError);
});

test('protocol identities and receipt references remain v7 even when entity references are legacy', () => {
  const command = envelope(
    'PURCHASE_REGISTER',
    purchasePayload,
    statePreconditions,
  );
  for (const patch of [
    { operationId: legacy(20) },
    { deviceId: legacy(20) },
    { dependsOn: [legacy(20)] },
    { supersedesOperationId: legacy(20) },
    {
      preconditions: {
        ...statePreconditions,
        expectedStateRevision: { operationId: legacy(20) },
      },
    },
  ])
    assert.throws(
      () => decodeCommandEnvelope({ ...command, ...patch }),
      TypeError,
    );
  assert.doesNotThrow(() =>
    decodeCommandEnvelope({
      ...command,
      dependsOn: [fresh(20)],
      supersedesOperationId: fresh(21),
      preconditions: {
        ...statePreconditions,
        expectedStateRevision: { operationId: fresh(20) },
      },
    }),
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.DeviceRegistration)({
        deviceId: legacy(20),
        protocolVersion: 1,
        domainVersion: 1,
      }),
    TypeError,
  );
});

test('all seven persisted DTOs, read models and history accept legacy IDs and FKs', () => {
  for (const [name, value] of Object.entries(stored)) {
    const schema = Object.entries(contractSchemas).find(
      ([key]) => key === name,
    )?.[1];
    assert.ok(schema);
    assert.doesNotThrow(() => createSchemaValidator(schema)(value), name);
  }
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.ProductRead)({
      product: stored.Product,
      state: stored.InventoryState,
      isLowStock: false,
      margin: null,
      markup: null,
    }),
  );
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.SaleDetail)({
      sale: stored.Sale,
      items: [stored.SaleItem],
      voidEligibility: { eligible: false, reason: null },
    }),
  );
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.PurchaseDetail)({
      purchase: stored.Purchase,
      voidEligibility: { eligible: false, reason: null },
    }),
  );
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.HistoryEntry)({
      type: 'SALE',
      id: legacy(3),
      totalAmount: '2000000',
      units: 2,
      status: 'VOIDED',
      effectiveAt: 100,
      createdAt: 100,
    }),
  );
  const historyProduct = {
    productId: legacyProduct,
    productName: 'Legacy',
    productVariant: null,
    effectiveAt: 100,
    createdAt: 100,
  };
  const recent = [
    {
      ...historyProduct,
      type: 'PURCHASE',
      id: legacy(6),
      quantity: 1,
      unitCost: '0',
      totalAmount: '0',
      status: 'VOIDED',
    },
    {
      ...historyProduct,
      type: 'ADJUSTMENT',
      id: legacy(8),
      difference: 1,
      reason: 'COUNT_CORRECTION',
    },
  ];
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.HistoryPage)({
      items: recent,
      nextCursor: null,
    }),
  );
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.Dashboard)({
      fromInclusive: 0,
      toExclusive: 200,
      sales: { totalAmount: '0', estimatedProfit: null, unitsSold: 0 },
      lowStock: [],
      topSelling: {
        productId: legacyProduct,
        name: 'Legacy',
        variant: null,
        unitsSold: 2,
      },
      recent,
    }),
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.Product)({
        ...stored.Product,
        id: 'not-a-UUID',
      }),
    TypeError,
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.InventoryMovement)({
        ...stored.InventoryMovement,
        sourceId: 'not-a-UUID',
      }),
    TypeError,
  );
});

test('a new sale graph can reference a legacy Inventory/Product and travel in a complete ChangeSet', () => {
  const sale = { ...stored.Sale, id: fresh(3), status: 'CONFIRMED' };
  const item = { ...stored.SaleItem, id: fresh(4), saleId: fresh(3) };
  const movement = {
    ...stored.InventoryMovement,
    id: fresh(5),
    type: 'SALE',
    sourceType: 'SALE',
    sourceId: fresh(3),
    reversalOfMovementId: null,
    quantityDelta: -2,
    stockBefore: 0,
    stockAfter: -2,
  };
  const upserts = {
    products: [stored.Product],
    inventoryStates: [stored.InventoryState],
    sales: [sale],
    saleItems: [item],
    purchases: [stored.Purchase],
    stockAdjustments: [stored.StockAdjustment],
    inventoryMovements: [movement],
  };
  const changeSet = {
    inventoryId: legacy(1),
    revision: '9007199254740993',
    serverRecordedAt: 200,
    upserts,
    tombstones: [],
  };
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.ChangeSet)(changeSet),
  );
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.ChangesResponse)({
      inventoryId: legacy(1),
      highWaterMark: changeSet.revision,
      changeSets: [changeSet],
      nextCursor: null,
      hasMore: false,
    }),
  );
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.DeviceRegistrationResult)({
      deviceId: fresh(101),
      inventoryId: legacy(1),
    }),
  );
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.SnapshotDescriptor)({
      snapshotId: fresh(30),
      inventoryId: legacy(1),
      highWaterMark: '1',
      expiresAt: 200,
      cursor: 'opaque',
    }),
  );
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.OperationReceipt)({
      operationId: fresh(100),
      status: 'ACCEPTED',
      changeSet,
    }),
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.OperationReceipt)({
        operationId: legacy(100),
        status: 'ACCEPTED',
        changeSet,
      }),
    TypeError,
  );
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.RegisterSaleResult)({
      sale,
      items: [item],
      states: [stored.InventoryState],
      movements: [movement],
      committedRevision: '1',
      serverRecordedAt: 200,
    }),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(changeSet)), changeSet);
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.SnapshotPage)({
      snapshotId: fresh(30),
      inventoryId: legacy(1),
      highWaterMark: '1',
      upserts,
      nextCursor: null,
      complete: true,
    }),
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.SnapshotPage)({
        snapshotId: legacy(30),
        inventoryId: legacy(1),
        highWaterMark: '1',
        upserts,
        nextCursor: null,
        complete: true,
      }),
    TypeError,
  );
});

test('import reservation/activation preserve legacy Inventory ID; local Backup V1 remains unchanged', () => {
  const reservation = {
    inventoryId: legacy(1),
    backup: { format: 'stockapp-backup', formatVersion: 1 },
    sha256: 'a'.repeat(64),
    totalBytes: 100,
    chunkCount: 1,
    consent: true,
  };
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.ImportReservation)(reservation),
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.ImportReservation)({
        ...reservation,
        inventoryId: 'local-non-UUID',
      }),
    TypeError,
  );
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.ImportCommitResult)({
      importId: fresh(31),
      inventoryId: legacy(1),
      generation: legacy(32),
      cursor: 'opaque',
      status: 'COMMITTED',
    }),
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.ImportProgress)({
        importId: legacy(31),
        status: 'READY',
        chunkCount: 1,
        receivedChunks: 1,
        expiresAt: 200,
      }),
    TypeError,
  );
  const backup = {
    format: 'stockapp-backup',
    formatVersion: 1,
    createdAt: 100,
    inventoryId: 'local-non-UUID',
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
});

test('ownership reads accept legacy Inventory but retain server-created v7 Business and strict bootstrap input', () => {
  const inventory = {
    id: legacy(1),
    name: 'Legacy',
    currency: 'USD',
    reportingTimeZone: 'America/Guayaquil',
  };
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.Inventory)(inventory),
  );
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.InventoryParams)({
      inventoryId: legacy(1),
    }),
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.InventoryParams)({
        inventoryId: 'not-a-UUID',
      }),
    TypeError,
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.Business)({
        id: legacy(1),
        status: 'ACTIVE',
        cloudAccessEnabled: false,
      }),
    TypeError,
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.BootstrapRequest)({
        inventoryName: 'Legacy',
        currency: 'USD',
        reportingTimeZone: 'America/Guayaquil',
        inventoryId: legacy(1),
      }),
    TypeError,
  );
});

test('generated OpenAPI separates persisted paths/references from new entity and protocol identities', () => {
  const document = generateOpenApi();
  for (const [path, field, schema] of [
    ['/v1/inventories/{inventoryId}', 'inventoryId', uuidSchema],
    ['/v1/inventories/{inventoryId}/products', 'inventoryId', uuidSchema],
    [
      '/v1/inventories/{inventoryId}/products/{productId}',
      'productId',
      uuidSchema,
    ],
    ['/v1/inventories/{inventoryId}/sales/{saleId}', 'saleId', uuidSchema],
    [
      '/v1/inventories/{inventoryId}/purchases/{purchaseId}',
      'purchaseId',
      uuidSchema,
    ],
    [
      '/v1/inventories/{inventoryId}/operations/{operationId}',
      'operationId',
      uuidV7Schema,
    ],
    ['/v1/imports/{importId}', 'importId', uuidV7Schema],
    [
      '/v1/inventories/{inventoryId}/sync/snapshots/{snapshotId}',
      'snapshotId',
      uuidV7Schema,
    ],
  ] as const)
    assert.deepEqual(
      document.paths[path]?.get?.parameters.find(
        (parameter) => parameter.name === field,
      )?.schema,
      schema,
    );
  const component = document.components.schemas.RegisterSaleCommand;
  assert.ok(component && typeof component === 'object');
  const payload = component.properties?.payload;
  assert.ok(payload && typeof payload === 'object');
  assert.deepEqual(payload.properties?.saleId, {
    $ref: '#/components/schemas/UUIDv7',
  });
  const items = payload.properties?.items;
  assert.ok(items && typeof items === 'object');
  const line = items.items;
  assert.ok(
    line &&
      typeof line === 'object' &&
      !Array.isArray(line) &&
      'properties' in line,
  );
  assert.deepEqual(line.properties?.productId, {
    $ref: '#/components/schemas/UUID',
  });
});
