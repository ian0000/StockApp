import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateMargin, calculateMarkup, Money } from '@stock-app/domain';
import { readFixture } from './helpers.js';
import {
  readProduct,
  readProductPage,
} from '../../src/read-models/products.js';
import { id } from '../postgres/helpers.js';

test('products keyset includes same-time rows once, caps100, excludes archive and is live across requests', async (t) => {
  const f = await readFixture(t),
    ids = Array.from({ length: 105 }, () => id());
  await f.pool.query(
    "INSERT INTO products(id,inventory_id,name,regular_sale_price_units,created_at,updated_at) SELECT x::uuid,$1,'Fictional',15000000,1000,1000 FROM unnest($2::text[])x",
    [f.context.inventory.id, ids],
  );
  await f.pool.query(
    'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units)SELECT inventory_id,id,0,NULL FROM products',
  );
  await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [
    ids[0],
  ]);
  const before = await f.counts(f.context),
    first = await f.read((db) =>
      readProductPage(db, f.scope('products'), 100, undefined, f.codec),
    );
  assert.equal(first.items.length, 100);
  assert.ok(first.nextCursor);
  const second = await f.read((db) =>
    readProductPage(db, f.scope('products'), 100, first.nextCursor!, f.codec),
  );
  assert.equal(second.items.length, 4);
  assert.equal(second.nextCursor, null);
  assert.equal(
    new Set([...first.items, ...second.items].map((v) => v.product.id)).size,
    104,
  );
  assert.deepEqual(
    [...first.items, ...second.items].map((v) => v.product.id),
    ids
      .filter((v) => v !== ids[0])
      .sort()
      .reverse(),
  );
  assert.deepEqual(await f.counts(f.context), before);
  for (const scope of [
    f.scope('stock-low'),
    f.scope('products', 'changed'),
    f.scope('products', '', (await f.dataset()).inventory.id),
  ])
    await assert.rejects(
      () =>
        f.read((db) =>
          readProductPage(db, scope, 100, first.nextCursor!, f.codec),
        ),
      { statusCode: 400 },
    );
});
test('product search follows trimmed/collapsed case-insensitive names/variants and exact string barcodes', async (t) => {
  const f = await readFixture(t),
    a = await f.product(),
    b = await f.product();
  await f.pool.query(
    "UPDATE products SET name='  Sparkling   Water ',variant='LARGE BLUE',barcode='001234' WHERE id=$1",
    [a],
  );
  await f.pool.query(
    "UPDATE products SET name='Milk',variant=NULL,barcode='1234' WHERE id=$1",
    [b],
  );
  for (const term of ['sparkling water', 'large blue', '001234'])
    assert.deepEqual(
      (
        await f.read((db) =>
          readProductPage(
            db,
            f.scope('products', term),
            50,
            undefined,
            f.codec,
          ),
        )
      ).items.map((v) => v.product.id),
      [a],
    );
  assert.deepEqual(
    (
      await f.read((db) =>
        readProductPage(
          db,
          f.scope('products', '1234'),
          50,
          undefined,
          f.codec,
        ),
      )
    ).items.map((v) => v.product.id),
    [b],
  );
  for (const term of ['01234', '%', '_'])
    assert.equal(
      (
        await f.read((db) =>
          readProductPage(
            db,
            f.scope('products', term),
            50,
            undefined,
            f.codec,
          ),
        )
      ).items.length,
      0,
    );
  assert.equal(
    (await readProduct(f.db, f.context.inventory.id, { barcode: '001234' }))
      ?.product.id,
    a,
  );
  assert.equal(
    (await readProduct(f.db, f.context.inventory.id, { barcode: '1234' }))
      ?.product.id,
    b,
  );
  assert.equal(
    await readProduct(f.db, f.context.inventory.id, { barcode: ' 001234' }),
    null,
  );
});
for (const cost of [null, '0', '10000000', '9007199254740991'] as const)
  test(`ProductRead preserves cost ${cost}, profitability availability, negative stock and legacy references`, async (t) => {
    const f = await readFixture(t),
      productId = await f.product(0, cost);
    await f.pool.query('UPDATE inventory_states SET stock=-2');
    await f.pool.query('UPDATE products SET minimum_stock=0');
    const result = await readProduct(
      f.db,
      f.context.inventory.id.toLowerCase(),
      { id: productId.toUpperCase() },
    );
    assert.ok(result);
    assert.equal(result.state.unitCost, cost);
    assert.equal(result.state.stock, -2);
    assert.equal(result.isLowStock, true);
    if (cost === null) {
      assert.equal(result.margin, null);
      assert.equal(result.markup, null);
    } else {
      const input = {
        salePrice: Money.fromScaledUnits(15000000),
        estimatedUnitCost: Money.fromScaledUnits(Number(cost)),
      };
      function available(fn: () => ReturnType<typeof calculateMargin>) {
        try {
          return fn()?.scaledUnits.toString() ?? null;
        } catch (e) {
          if (e instanceof RangeError) return null;
          throw e;
        }
      }
      assert.equal(
        result.margin,
        available(() => calculateMargin(input)),
      );
      assert.equal(
        result.markup,
        available(() => calculateMarkup(input)),
      );
    }
  });
test('low-stock Domain predicate handles null/zero minimum and keyset across non-low batches', async (t) => {
  const f = await readFixture(t),
    a = await f.product(0, null),
    b = await f.product(0, null),
    c = await f.product(0, null);
  await f.pool.query(
    'UPDATE inventory_states SET stock=-1 WHERE product_id=$1',
    [a],
  );
  await f.pool.query(
    'UPDATE products SET minimum_stock=0 WHERE id=ANY($1::uuid[])',
    [[b, c]],
  );
  const first = await readProductPage(
    f.db,
    f.scope('stock-low'),
    1,
    undefined,
    f.codec,
    true,
  );
  assert.equal(first.items.length, 1);
  assert.ok(first.nextCursor);
  assert.equal(first.items[0].isLowStock, true);
  const second = await readProductPage(
    f.db,
    f.scope('stock-low'),
    1,
    first.nextCursor!,
    f.codec,
    true,
  );
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  assert.notEqual(first.items[0].product.id, second.items[0].product.id);
  assert.ok(
    ![first.items[0].product.id, second.items[0].product.id].includes(a),
  );
});
test('missing/foreign/archived product is absent; missing active State fails instead of skipping', async (t) => {
  const f = await readFixture(t),
    other = await f.dataset(),
    foreign = await f.product(20, '10000000', '15000000', other),
    own = await f.product();
  assert.equal(
    await readProduct(f.db, f.context.inventory.id, { id: foreign }),
    null,
  );
  assert.equal(
    await readProduct(f.db, f.context.inventory.id, { id: id() }),
    null,
  );
  await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [own]);
  assert.equal(
    await readProduct(f.db, f.context.inventory.id, { id: own }),
    null,
  );
  const broken = await f.product();
  await f.pool.query('DELETE FROM inventory_states WHERE product_id=$1', [
    broken,
  ]);
  await assert.rejects(() =>
    readProduct(f.db, f.context.inventory.id, { id: broken }),
  );
  await assert.rejects(() =>
    readProductPage(f.db, f.scope('products'), 50, undefined, f.codec),
  );
  await assert.rejects(() =>
    readProductPage(f.db, f.scope('stock-low'), 50, undefined, f.codec, true),
  );
});
