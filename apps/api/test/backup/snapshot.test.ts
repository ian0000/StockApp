import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CreateBackupUseCase,
  parseBackupV1,
  type BackupDataV1,
} from '@stock-app/application';
import { contractSchemas, createSchemaValidator } from '@stock-app/contracts';
import { createPostgresBackupReader } from '../../src/backup/snapshot.js';
import { backupFixture } from './helpers.js';
import { barrier } from '../helpers/commands.js';
import { createCommand } from '../products/helpers.js';
import { saleCommand } from '../sales/helpers.js';
import { id } from '../postgres/helpers.js';
import { sql } from 'drizzle-orm';
import type { PgTransactionConfig } from 'drizzle-orm/pg-core';
import type { CommandTransaction } from '../../src/infrastructure/postgres/command-executor.js';

test('legacy Inventory/Product UUIDs and exact safe numeric boundaries remain unchanged in canonical backup', async (t) => {
  const f = await backupFixture(t),
    a = await f.owner('legacy');
  const inventoryId = '550e8400-e29b-41d4-a716-446655440000',
    productId = '123e4567-e89b-42d3-a456-426614174000';
  await f.pool.query('UPDATE inventories SET id=$1 WHERE id=$2', [
    inventoryId,
    a.context.inventory.id,
  ]);
  await f.pool.query(
    'INSERT INTO products(id,inventory_id,name,regular_sale_price_units,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6)',
    [
      productId,
      inventoryId,
      'LEGACY_BACKUP_PRIVATE_Q7X9',
      String(Number.MAX_SAFE_INTEGER),
      '10',
      String(Number.MAX_SAFE_INTEGER),
    ],
  );
  await f.pool.query(
    'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units) VALUES($1,$2,$3,$4)',
    [inventoryId, productId, '0', null],
  );
  const artifact = await new CreateBackupUseCase({
    reader: createPostgresBackupReader(f.db, a.authenticated.user.id, true),
    clock: { now: f.clock },
  }).execute({ inventoryId });
  const backup = parseBackupV1(artifact.contents);
  assert.equal(backup.inventoryId, inventoryId);
  assert.equal(backup.data.products[0].id, productId);
  assert.equal(
    backup.data.products[0].regularSalePriceUnits,
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(backup.data.products[0].updatedAt, Number.MAX_SAFE_INTEGER);
  createSchemaValidator(contractSchemas.BackupV1)(
    JSON.parse(artifact.contents),
  );
});

test('real PostgreSQL BackupV1 includes all eight collections and complete archived/void/reversal/adjustment history without foreign or cloud data', async (t) => {
  const f = await backupFixture(t),
    a = await f.owner('snapshot-a'),
    b = await f.owner('snapshot-b');
  const own = await f.history(a.context, 'A'),
    foreign = await f.history(b.context, 'B');
  const reader = createPostgresBackupReader(
    f.db,
    a.authenticated.user.id,
    true,
  );
  const useCase = new CreateBackupUseCase({ reader, clock: { now: f.clock } });
  const first = await useCase.execute({ inventoryId: a.context.inventory.id });
  const second = await useCase.execute({ inventoryId: a.context.inventory.id });
  assert.equal(first.contents, second.contents);
  createSchemaValidator(contractSchemas.BackupV1)(JSON.parse(first.contents));
  const backup = parseBackupV1(first.contents);
  assert.equal(backup.data.inventories.length, 1);
  assert.equal(Object.keys(backup.data).length, 8);
  for (const rows of Object.values(backup.data)) assert.ok(rows.length > 0);
  assert.deepEqual(
    new Set(backup.data.inventoryMovements.map((row) => row.type)),
    new Set([
      'INITIAL_STOCK',
      'PURCHASE',
      'SALE',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'REVERSAL',
    ]),
  );
  assert.equal(
    backup.data.products.find(
      (row) => row.id === own.archived.payload.productId,
    )?.isArchived,
    true,
  );
  assert.equal(
    backup.data.sales.find((row) => row.id === own.sale.payload.saleId)?.status,
    'VOIDED',
  );
  assert.equal(backup.data.purchases[0].status, 'VOIDED');
  assert.equal(
    backup.data.inventoryStates.find(
      (row) => row.productId === own.zero.payload.productId,
    )?.unitCostUnits,
    0,
  );
  assert.deepEqual(
    backup.data.inventoryStates.find(
      (row) => row.productId === own.unknown.payload.productId,
    ),
    {
      inventoryId: a.context.inventory.id,
      productId: own.unknown.payload.productId,
      stock: -2,
      unitCostUnits: null,
    },
  );
  const foreignSnapshot = await createPostgresBackupReader(
    f.db,
    b.authenticated.user.id,
    true,
  ).readSnapshot(b.context.inventory.id);
  // Entity IDs are canaries in every collection, not just Product names or one parent table.
  for (const rows of Object.values(foreignSnapshot))
    for (const row of rows)
      assert.equal(
        first.contents.includes('id' in row ? row.id : row.productId),
        false,
      );
  assert.equal(first.contents.includes(foreign.sale.payload.saleId), false);
  assert.doesNotMatch(
    first.contents,
    /metadataRevision|stateRevision|lastMovementId|generation|businessId|reversalOfMovementId|operationReceipt|password|token|BACKUP_.*_B_PRIVATE_Q7X9/,
  );
  await assert.rejects(reader.readSnapshot(b.context.inventory.id));
  // Reuse the canonical integrity authority; corrupt adapter output never becomes an artifact.
  const snapshot = await reader.readSnapshot(a.context.inventory.id);
  for (const data of [
    { ...snapshot, inventoryStates: [] },
    { ...snapshot, inventories: foreignSnapshot.inventories },
    {
      ...snapshot,
      saleItems: [
        ...snapshot.saleItems,
        { ...snapshot.saleItems[0], productId: foreign.zero.payload.productId },
      ],
    },
    {
      ...snapshot,
      products: snapshot.products.map((row) => ({
        ...row,
        regularSalePriceUnits: Number.MAX_SAFE_INTEGER + 1,
      })),
    },
  ] satisfies BackupDataV1[]) {
    await assert.rejects(
      new CreateBackupUseCase({
        reader: {
          async readSnapshot() {
            return data;
          },
        },
        clock: { now: f.clock },
      }).execute({ inventoryId: a.context.inventory.id }),
    );
  }
});

test('one repeatable-read read-only snapshot remains coherent when a multiproduct Sale commits during export without an Inventory write lock', async (t) => {
  const f = await backupFixture(t),
    a = await f.owner('race');
  const products = [
    createCommand({
      initialStock: 10,
      initialUnitCost: '0',
      initialMovementId: id(),
    }),
    createCommand({
      initialStock: 10,
      initialUnitCost: '0',
      initialMovementId: id(),
    }),
  ];
  for (const command of products) await f.run(a.context, command);
  const sale = saleCommand(
    products.map((command) => ({
      productId: command.payload.productId,
      quantity: 2,
      price: '1000000',
      cost: '0',
      estimatedCost: '0',
      estimatedProfit: '2000000',
    })),
  );
  const acquired = barrier(),
    release = barrier();
  // Wrap only the transaction boundary: all collections still execute real adapter SQL.
  const snapshotDb = {
    transaction<T>(
      handler: (tx: CommandTransaction) => Promise<T>,
      config?: PgTransactionConfig,
    ): Promise<T> {
      return f.db.transaction(async (tx) => {
        const isolation = await tx.execute<{ transaction_isolation: string }>(
          sql`SHOW transaction_isolation`,
        );
        const mode = await tx.execute<{ transaction_read_only: string }>(
          sql`SHOW transaction_read_only`,
        );
        assert.equal(
          isolation.rows[0].transaction_isolation,
          'repeatable read',
        );
        assert.equal(mode.rows[0].transaction_read_only, 'on');
        await tx.execute(
          sql`SELECT id FROM inventories WHERE id=${a.context.inventory.id}`,
        );
        acquired.release();
        await release.wait;
        return handler(tx);
      }, config);
    },
  };
  const reader = createPostgresBackupReader(
    snapshotDb,
    a.authenticated.user.id,
    true,
  );
  const pending = reader.readSnapshot(a.context.inventory.id);
  await acquired.wait;
  try {
    await f.run(a.context, sale);
  } finally {
    release.release();
  }
  const before = await pending;
  assert.equal(before.sales.length, 0);
  assert.equal(before.saleItems.length, 0);
  assert.equal(before.inventoryMovements.length, 2);
  assert.deepEqual(
    before.inventoryStates.map((row) => row.stock),
    [10, 10],
  );
  const after = await createPostgresBackupReader(
    f.db,
    a.authenticated.user.id,
    true,
  ).readSnapshot(a.context.inventory.id);
  assert.equal(after.sales.length, 1);
  assert.equal(after.saleItems.length, 2);
  assert.equal(after.inventoryMovements.length, 4);
  assert.deepEqual(
    after.inventoryStates.map((row) => row.stock),
    [8, 8],
  );
});
