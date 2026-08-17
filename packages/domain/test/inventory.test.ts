import assert from 'node:assert/strict';
import test from 'node:test';

import { createInventory } from '../src/index';

const CREATED_AT = 1_776_444_000_000;

function validInventoryInput() {
  return {
    id: 'inventory-local-1',
    name: 'Mi Negocio',
    currency: 'USD',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT + 1_000,
  };
}

test('creates a valid Inventory', () => {
  const inventory = createInventory(validInventoryInput());

  assert.deepEqual(inventory, {
    id: 'inventory-local-1',
    name: 'Mi Negocio',
    currency: 'USD',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT + 1_000,
  });
});

test('preserves the Inventory ID as an opaque identifier', () => {
  const inventory = createInventory({
    ...validInventoryInput(),
    id: 'custom-offline-id',
  });

  assert.equal(inventory.id, 'custom-offline-id');
});

test('trims the Inventory ID', () => {
  const inventory = createInventory({
    ...validInventoryInput(),
    id: '  inventory-local-1  ',
  });

  assert.equal(inventory.id, 'inventory-local-1');
});

test('rejects an empty Inventory ID', () => {
  assert.throws(
    () => createInventory({ ...validInventoryInput(), id: '' }),
    /inventory id.*empty/i,
  );
  assert.throws(
    () => createInventory({ ...validInventoryInput(), id: '   ' }),
    /inventory id.*empty/i,
  );
});

test('preserves the Inventory name', () => {
  const inventory = createInventory({
    ...validInventoryInput(),
    name: 'Tienda Central',
  });

  assert.equal(inventory.name, 'Tienda Central');
});

test('trims the Inventory name', () => {
  const inventory = createInventory({
    ...validInventoryInput(),
    name: '  Mi Negocio  ',
  });

  assert.equal(inventory.name, 'Mi Negocio');
});

test('rejects an empty Inventory name', () => {
  assert.throws(
    () => createInventory({ ...validInventoryInput(), name: '' }),
    /inventory name.*empty/i,
  );
  assert.throws(
    () => createInventory({ ...validInventoryInput(), name: '   ' }),
    /inventory name.*empty/i,
  );
});

test('preserves canonical USD currency', () => {
  const inventory = createInventory(validInventoryInput());

  assert.equal(inventory.currency, 'USD');
});

test('trims and uppercases usd currency', () => {
  const inventory = createInventory({
    ...validInventoryInput(),
    currency: ' usd ',
  });

  assert.equal(inventory.currency, 'USD');
});

test('uppercases eur currency', () => {
  const inventory = createInventory({
    ...validInventoryInput(),
    currency: 'eur',
  });

  assert.equal(inventory.currency, 'EUR');
});

test('rejects a two-letter currency code', () => {
  assert.throws(
    () => createInventory({ ...validInventoryInput(), currency: 'US' }),
    /currency.*three ASCII letters/i,
  );
});

test('rejects a four-letter currency code', () => {
  assert.throws(
    () => createInventory({ ...validInventoryInput(), currency: 'USDD' }),
    /currency.*three ASCII letters/i,
  );
});

test('rejects numbers in a currency code', () => {
  assert.throws(
    () => createInventory({ ...validInventoryInput(), currency: '12A' }),
    /currency.*three ASCII letters/i,
  );
});

test('rejects symbols in a currency code', () => {
  assert.throws(
    () => createInventory({ ...validInventoryInput(), currency: 'U$D' }),
    /currency.*three ASCII letters/i,
  );
});

test('rejects non-ASCII letters in a currency code', () => {
  assert.throws(
    () => createInventory({ ...validInventoryInput(), currency: '€UR' }),
    /currency.*three ASCII letters/i,
  );
});

test('accepts a lexically valid code without checking a catalog', () => {
  const inventory = createInventory({
    ...validInventoryInput(),
    currency: 'abc',
  });

  assert.equal(inventory.currency, 'ABC');
});

test('preserves createdAt', () => {
  const inventory = createInventory(validInventoryInput());

  assert.equal(inventory.createdAt, CREATED_AT);
});

test('preserves updatedAt', () => {
  const inventory = createInventory(validInventoryInput());

  assert.equal(inventory.updatedAt, CREATED_AT + 1_000);
});

test('rejects negative timestamps', () => {
  assert.throws(
    () => createInventory({ ...validInventoryInput(), createdAt: -1 }),
    /created at.*non-negative/i,
  );
  assert.throws(
    () => createInventory({ ...validInventoryInput(), updatedAt: -1 }),
    /updated at.*non-negative/i,
  );
});

test('rejects fractional timestamps', () => {
  assert.throws(
    () => createInventory({ ...validInventoryInput(), createdAt: 1.5 }),
    /created at.*safe integer/i,
  );
  assert.throws(
    () => createInventory({ ...validInventoryInput(), updatedAt: 1.5 }),
    /updated at.*safe integer/i,
  );
});

test('rejects unsafe timestamps', () => {
  const unsafeTimestamp = Number.MAX_SAFE_INTEGER + 1;

  assert.throws(
    () =>
      createInventory({
        ...validInventoryInput(),
        createdAt: unsafeTimestamp,
      }),
    /created at.*safe integer/i,
  );
  assert.throws(
    () =>
      createInventory({
        ...validInventoryInput(),
        updatedAt: unsafeTimestamp,
      }),
    /updated at.*safe integer/i,
  );
});

test('rejects updatedAt before createdAt', () => {
  assert.throws(
    () =>
      createInventory({
        ...validInventoryInput(),
        updatedAt: CREATED_AT - 1,
      }),
    /updated at.*before.*created at/i,
  );
});

test('allows equal creation and update timestamps', () => {
  const inventory = createInventory({
    ...validInventoryInput(),
    updatedAt: CREATED_AT,
  });

  assert.equal(inventory.createdAt, inventory.updatedAt);
});

test('creates an immutable Inventory', () => {
  const inventory = createInventory(validInventoryInput());

  assert.ok(Object.isFrozen(inventory));
  assert.throws(() => Object.assign(inventory, { name: 'Changed' }), TypeError);
});

test('does not mutate the creation input', () => {
  const input = {
    ...validInventoryInput(),
    id: '  inventory-local-1  ',
    name: '  Mi Negocio  ',
    currency: ' usd ',
  };
  const original = { ...input };

  createInventory(input);

  assert.deepEqual(input, original);
});

test('does not contain Products', () => {
  const inventory = createInventory(validInventoryInput());

  assert.equal('products' in inventory, false);
  assert.equal('productIds' in inventory, false);
});

test('does not contain product stock or cost', () => {
  const inventory = createInventory(validInventoryInput());

  assert.equal('stock' in inventory, false);
  assert.equal('currentStock' in inventory, false);
  assert.equal('cost' in inventory, false);
  assert.equal('unitCost' in inventory, false);
  assert.equal('currentAverageCost' in inventory, false);
});
