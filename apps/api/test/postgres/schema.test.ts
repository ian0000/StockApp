import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import {
  products,
  inventoryChangeSets,
} from '../../src/infrastructure/postgres/schema.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';
import { disposableDatabase, id, insertFixtureUser } from './helpers.js';

test('PostgreSQL protects row integrity, scoped relationships and exact values', async (t) => {
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool);
  assert.equal((await pool.query('SHOW timezone')).rows[0].TimeZone, 'UTC');
  for (const owner of ['owner-a', 'owner-b', 'another-owner', 'rollback-owner'])
    await insertFixtureUser(pool, owner);
  const businessA = id(),
    businessB = id(),
    inventoryA = id(),
    inventoryB = id(),
    productA = id(),
    productB = id(),
    saleA = id(),
    saleB = id();
  await pool.query(
    'INSERT INTO businesses (id,owner_user_id) VALUES ($1,$2),($3,$4)',
    [businessA, 'owner-a', businessB, 'owner-b'],
  );
  await pool.query(
    "INSERT INTO inventories (id,business_id,name,currency,reporting_time_zone,created_at,updated_at) VALUES ($1,$2,'A','USD','America/Guayaquil',1,1),($3,$4,'B','EUR','UTC',1,1)",
    [inventoryA, businessA, inventoryB, businessB],
  );
  await pool.query(
    "INSERT INTO products (id,inventory_id,name,regular_sale_price_units,created_at,updated_at) VALUES ($1,$2,'A',3,1,1),($3,$4,'B',3,1,1)",
    [productA, inventoryA, productB, inventoryB],
  );
  await pool.query(
    'INSERT INTO sales (id,inventory_id,total_amount_units,effective_at,created_at,updated_at) VALUES ($1,$2,6,1,1,1),($3,$4,6,1,1,1)',
    [saleA, inventoryA, saleB, inventoryB],
  );
  const times = { effective_at: 1, created_at: 1, updated_at: 1 };
  const fixtures = {
    businesses: { id: id(), owner_user_id: 'another-owner' },
    inventories: {
      id: id(),
      business_id: id(),
      name: 'Inventory',
      currency: 'USD',
      reporting_time_zone: 'UTC',
      created_at: 1,
      updated_at: 1,
    },
    products: {
      id: id(),
      inventory_id: inventoryA,
      name: 'Product',
      regular_sale_price_units: 0,
      created_at: 1,
      updated_at: 1,
    },
    sale_items: {
      id: id(),
      inventory_id: inventoryA,
      sale_id: saleA,
      product_id: productA,
      quantity: 2,
      unit_sale_price_units: 3,
      subtotal_units: 6,
      unit_cost_snapshot_units: 0,
      estimated_cost_units: 0,
      estimated_profit_units: 6,
      cost_status: 'KNOWN',
      created_at: 1,
      updated_at: 1,
    },
    purchases: {
      id: id(),
      inventory_id: inventoryA,
      product_id: productA,
      quantity: 2,
      unit_cost_units: 3,
      total_amount_units: 6,
      stock_before: -2,
      stock_after: 0,
      average_cost_before_units: null,
      average_cost_after_units: 3,
      ...times,
    },
    stock_adjustments: {
      id: id(),
      inventory_id: inventoryA,
      product_id: productA,
      stock_before: 1,
      actual_stock: 2,
      difference: 1,
      reason: 'COUNT_CORRECTION',
      cost_mode: 'CUSTOM_COST',
      unit_cost_units: 0,
      ...times,
    },
    inventory_movements: {
      id: id(),
      inventory_id: inventoryA,
      product_id: productA,
      type: 'SALE',
      quantity_delta: -1,
      stock_before: 0,
      stock_after: -1,
      source_type: 'SALE',
      source_id: saleA,
      ...times,
    },
  };
  async function insert(
    table: keyof typeof fixtures,
    overrides: Record<string, unknown> = {},
  ) {
    const row = { ...fixtures[table], id: id(), ...overrides };
    const columns = Object.keys(row);
    // Only fixed test fixtures supply table/column names, never application input.
    return pool.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      Object.values(row),
    );
  }
  const invalid: {
    name: string;
    table: keyof typeof fixtures;
    values: Record<string, unknown>;
    code?: string;
  }[] = [
    {
      name: 'owner required',
      table: 'businesses',
      values: { owner_user_id: null },
      code: '23502',
    },
    {
      name: 'owner unique',
      table: 'businesses',
      values: { owner_user_id: 'owner-a' },
      code: '23505',
    },
    {
      name: 'business status',
      table: 'businesses',
      values: { status: 'INVALID' },
    },
    {
      name: 'inventory business unique',
      table: 'inventories',
      values: { business_id: businessA },
      code: '23505',
    },
    {
      name: 'inventory business FK',
      table: 'inventories',
      values: {},
      code: '23503',
    },
    {
      name: 'currency shape',
      table: 'inventories',
      values: { business_id: businessA, currency: 'usd' },
    },
    {
      name: 'product minimum stock',
      table: 'products',
      values: { minimum_stock: -1 },
    },
    {
      name: 'money above safe',
      table: 'products',
      values: { regular_sale_price_units: '9007199254740992' },
    },
    {
      name: 'negative price',
      table: 'products',
      values: { regular_sale_price_units: -1 },
    },
    {
      name: 'metadata revision negative',
      table: 'products',
      values: { metadata_revision: -1 },
    },
    {
      name: 'negative timestamp',
      table: 'products',
      values: { created_at: -1 },
    },
    {
      name: 'unsafe timestamp',
      table: 'products',
      values: { updated_at: '9007199254740992' },
    },
    {
      name: 'updated before creation',
      table: 'products',
      values: { created_at: 2, updated_at: 1 },
    },
    {
      name: 'item quantity zero',
      table: 'sale_items',
      values: { quantity: 0 },
    },
    {
      name: 'item cross inventory product',
      table: 'sale_items',
      values: { product_id: productB },
      code: '23503',
    },
    {
      name: 'item cross inventory sale',
      table: 'sale_items',
      values: { sale_id: saleB },
      code: '23503',
    },
    {
      name: 'item subtotal mismatch',
      table: 'sale_items',
      values: { subtotal_units: 5 },
    },
    {
      name: 'item zero price',
      table: 'sale_items',
      values: { unit_sale_price_units: 0 },
    },
    {
      name: 'known snapshot absent',
      table: 'sale_items',
      values: { unit_cost_snapshot_units: null },
    },
    {
      name: 'known estimate absent',
      table: 'sale_items',
      values: { estimated_cost_units: null },
    },
    {
      name: 'unknown cost populated',
      table: 'sale_items',
      values: { cost_status: 'UNKNOWN' },
    },
    {
      name: 'profit mismatch',
      table: 'sale_items',
      values: { estimated_profit_units: 5 },
    },
    {
      name: 'cost multiplication mismatch',
      table: 'sale_items',
      values: { unit_cost_snapshot_units: 1 },
    },
    {
      name: 'purchase cross inventory',
      table: 'purchases',
      values: { product_id: productB },
      code: '23503',
    },
    {
      name: 'purchase quantity zero',
      table: 'purchases',
      values: { quantity: 0 },
    },
    {
      name: 'purchase negative cost',
      table: 'purchases',
      values: { unit_cost_units: -1 },
    },
    {
      name: 'purchase transition',
      table: 'purchases',
      values: { stock_after: 1 },
    },
    {
      name: 'purchase total',
      table: 'purchases',
      values: { total_amount_units: 5 },
    },
    {
      name: 'purchase positive stock needs known cost',
      table: 'purchases',
      values: { stock_before: 1, stock_after: 3 },
    },
    {
      name: 'purchase deficit not weighted',
      table: 'purchases',
      values: { average_cost_after_units: 4 },
    },
    {
      name: 'adjustment cross inventory',
      table: 'stock_adjustments',
      values: { product_id: productB },
      code: '23503',
    },
    {
      name: 'adjustment zero difference',
      table: 'stock_adjustments',
      values: { difference: 0 },
    },
    {
      name: 'adjustment transition',
      table: 'stock_adjustments',
      values: { actual_stock: 3 },
    },
    {
      name: 'adjustment reason',
      table: 'stock_adjustments',
      values: { reason: 'INVALID' },
    },
    {
      name: 'positive adjustment invalid direction',
      table: 'stock_adjustments',
      values: { reason: 'DAMAGED' },
    },
    {
      name: 'positive adjustment missing cost mode',
      table: 'stock_adjustments',
      values: { cost_mode: null },
    },
    {
      name: 'adjustment null cost',
      table: 'stock_adjustments',
      values: { unit_cost_units: null },
      code: '23502',
    },
    {
      name: 'movement cross inventory',
      table: 'inventory_movements',
      values: { product_id: productB },
      code: '23503',
    },
    {
      name: 'movement zero delta',
      table: 'inventory_movements',
      values: { quantity_delta: 0 },
    },
    {
      name: 'movement transition',
      table: 'inventory_movements',
      values: { stock_after: 2 },
    },
    {
      name: 'movement source pair',
      table: 'inventory_movements',
      values: { source_id: null },
    },
    {
      name: 'movement negative cost',
      table: 'inventory_movements',
      values: { unit_cost_snapshot_units: -1 },
    },
  ];
  for (const scenario of invalid)
    await t.test(scenario.name, async () => {
      await assert.rejects(insert(scenario.table, scenario.values), {
        code: scenario.code ?? '23514',
      });
    });
  await t.test(
    'active barcode unique per inventory; archived and null barcodes allowed',
    async () => {
      await insert('products', { barcode: '00123' });
      await assert.rejects(insert('products', { barcode: '00123' }), {
        code: '23505',
      });
      await insert('products', { barcode: '00123', inventory_id: inventoryB });
      const archived = await insert('products', {
        barcode: '00123',
        is_archived: true,
      });
      await assert.rejects(
        pool.query('UPDATE products SET is_archived=false WHERE id=$1', [
          archived.rows[0].id,
        ]),
        { code: '23505' },
      );
      await insert('products', { barcode: null });
      await insert('products', { barcode: null });
    },
  );
  await t.test(
    'states allow negative/null and distinguish positive known zero from unknown',
    async () => {
      await pool.query(
        'INSERT INTO inventory_states (inventory_id,product_id,stock,unit_cost_units) VALUES ($1,$2,-2,NULL)',
        [inventoryA, productA],
      );
      await assert.rejects(
        pool.query('UPDATE inventory_states SET stock=1 WHERE product_id=$1', [
          productA,
        ]),
        { code: '23514' },
      );
      await pool.query(
        'UPDATE inventory_states SET stock=1,unit_cost_units=0 WHERE product_id=$1',
        [productA],
      );
      assert.deepEqual(
        (
          await pool.query(
            'SELECT stock,unit_cost_units FROM inventory_states WHERE product_id=$1',
            [productA],
          )
        ).rows[0],
        { stock: '1', unit_cost_units: '0' },
      );
      await assert.rejects(
        pool.query(
          'UPDATE inventory_states SET state_revision=-1 WHERE product_id=$1',
          [productA],
        ),
        { code: '23514' },
      );
      await assert.rejects(
        pool.query(
          'INSERT INTO inventory_states (inventory_id,product_id,stock) VALUES ($1,$2,0)',
          [inventoryA, productB],
        ),
        { code: '23503' },
      );
      await pool.query(
        'UPDATE inventory_states SET stock=0,unit_cost_units=NULL WHERE product_id=$1',
        [productA],
      );
    },
  );
  await t.test(
    'BIGINT boundaries and negative profit remain exact through pg and Drizzle',
    async () => {
      const result = await insert('products', {
        regular_sale_price_units: '9007199254740991',
      });
      const db = createDatabase(pool);
      const [row] = await db
        .select()
        .from(products)
        .where(eq(products.id, result.rows[0].id));
      assert.equal(row.regularSalePriceUnits, 9007199254740991n);
      assert.equal(result.rows[0].regular_sale_price_units, '9007199254740991');
      const unsafe = await pool.query(
        'SELECT 9007199254740993::bigint AS revision',
      );
      assert.equal(unsafe.rows[0].revision, '9007199254740993');
      await insert('sale_items', {
        unit_cost_snapshot_units: 5,
        estimated_cost_units: 10,
        estimated_profit_units: -4,
      });
      await insert('sale_items', {
        cost_status: 'UNKNOWN',
        unit_cost_snapshot_units: null,
        estimated_cost_units: null,
        estimated_profit_units: null,
      });
      await insert('purchases');
      await insert('stock_adjustments', {
        difference: -1,
        stock_before: 2,
        actual_stock: 1,
        reason: 'DAMAGED',
        cost_mode: null,
      });
    },
  );
  await t.test(
    'reversal is unique and same inventory/product; last movement scoped',
    async () => {
      const original = await insert('inventory_movements');
      const reversal = {
        type: 'REVERSAL',
        quantity_delta: 1,
        stock_before: -1,
        stock_after: 0,
        reversal_of_movement_id: original.rows[0].id,
      };
      await insert('inventory_movements', reversal);
      await assert.rejects(insert('inventory_movements', reversal), {
        code: '23505',
      });
      await assert.rejects(
        insert('inventory_movements', {
          ...reversal,
          inventory_id: inventoryB,
          product_id: productB,
        }),
        { code: '23503' },
      );
      await pool.query(
        'UPDATE inventory_states SET last_movement_id=$1 WHERE product_id=$2',
        [original.rows[0].id, productA],
      );
      const foreign = await insert('inventory_movements', {
        inventory_id: inventoryB,
        product_id: productB,
      });
      await assert.rejects(
        pool.query(
          'UPDATE inventory_states SET last_movement_id=$1 WHERE product_id=$2',
          [foreign.rows[0].id, productA],
        ),
        { code: '23503' },
      );
    },
  );
  await t.test(
    'ledger prevents product deletion and failed multiwrite transaction rolls back',
    async () => {
      await assert.rejects(
        pool.query('DELETE FROM products WHERE id=$1', [productA]),
        { code: '23503' },
      );
      const client = await pool.connect();
      const temporary = id();
      try {
        await client.query('BEGIN');
        await client.query(
          'INSERT INTO businesses (id,owner_user_id) VALUES ($1,$2)',
          [temporary, 'rollback-owner'],
        );
        await assert.rejects(
          client.query(
            'UPDATE products SET regular_sale_price_units=-1 WHERE id=$1',
            [productA],
          ),
          { code: '23514' },
        );
        await client.query('ROLLBACK');
        assert.equal(
          (
            await pool.query('SELECT id FROM businesses WHERE id=$1', [
              temporary,
            ])
          ).rowCount,
          0,
        );
      } finally {
        client.release();
      }
    },
  );
  await t.test(
    'delivery metadata persists exact revision, scoped devices and complete change sets',
    async () => {
      const device = id(),
        operation = id();
      await pool.query(
        "INSERT INTO sync_devices (id,business_id,protocol_version,domain_version) VALUES ($1,$2,1,'1')",
        [device, businessA],
      );
      const receipt = [
        businessA,
        operation,
        'f'.repeat(64),
        'SALE',
        'ACCEPTED',
        device,
      ];
      const query =
        'INSERT INTO operation_receipts (business_id,operation_id,payload_hash,kind,result_code,device_id) VALUES ($1,$2,$3,$4,$5,$6)';
      await pool.query(query, receipt);
      await assert.rejects(pool.query(query, receipt), { code: '23505' });
      await assert.rejects(
        pool.query(query, [
          businessB,
          id(),
          'f'.repeat(64),
          'SALE',
          'ACCEPTED',
          device,
        ]),
        { code: '23503' },
      );
      await pool.query(
        'INSERT INTO inventory_change_sets (inventory_id,revision,changes) VALUES ($1,$2,$3)',
        [inventoryA, '9007199254740993', { upserts: [], tombstones: [] }],
      );
      const [change] = await createDatabase(pool)
        .select()
        .from(inventoryChangeSets)
        .where(eq(inventoryChangeSets.inventoryId, inventoryA));
      assert.equal(change.revision, 9007199254740993n);
      assert.deepEqual(change.changes, { upserts: [], tombstones: [] });
      await assert.rejects(
        pool.query(
          'INSERT INTO inventory_change_sets (inventory_id,revision,changes) VALUES ($1,-1,$2)',
          [inventoryA, {}],
        ),
        { code: '23514' },
      );
      await assert.rejects(
        pool.query(
          'INSERT INTO inventory_change_sets (inventory_id,revision,changes) VALUES ($1,2,$2)',
          [inventoryA, JSON.stringify([])],
        ),
        { code: '23514' },
      );
      await pool.query(
        "INSERT INTO import_sessions (id,business_id,hash,inventory_id,expected_empty_generation,bytes,chunks,status,expires_at,consent_recorded_at) VALUES ($1,$2,$3,$4,$5,0,0,'STAGING',now()+interval '1 day',now())",
        [id(), businessA, 'f'.repeat(64), inventoryA, id()],
      );
      await pool.query(
        "INSERT INTO deletion_requests (id,user_id,status) VALUES ($1,'owner-a','PENDING')",
        [id()],
      );
    },
  );
});
