import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Money } from '@stock-app/domain';

import {
  CreateProductUseCase,
  type CreateProductInput,
  type ProductIdGenerator,
} from '../src/index';

class FakeProductIdGenerator implements ProductIdGenerator {
  calls = 0;

  constructor(private readonly ids: readonly string[]) {}

  generate(): string {
    const id = this.ids[this.calls];
    this.calls += 1;

    if (id === undefined) {
      throw new Error('Fake product ID sequence exhausted.');
    }

    return id;
  }
}

function validInput(
  overrides: Partial<CreateProductInput> = {},
): CreateProductInput {
  return {
    inventoryId: 'inventory-123',
    name: 'Coca Cola',
    variant: 'Original',
    barcode: '001234567890',
    regularSalePrice: Money.fromDecimal('1.25'),
    minimumStock: 5,
    initialStock: 0,
    initialUnitCost: null,
    ...overrides,
  };
}

function createUseCase(ids: readonly string[] = ['product-123']): {
  readonly useCase: CreateProductUseCase;
  readonly generator: FakeProductIdGenerator;
} {
  const generator = new FakeProductIdGenerator(ids);

  return {
    useCase: new CreateProductUseCase(generator),
    generator,
  };
}

test('creates a product with zero initial stock', () => {
  const { useCase } = createUseCase();

  const result = useCase.execute(validInput());

  assert.equal(result.product.name, 'Coca Cola');
  assert.equal(result.product.isArchived, false);
});

test('uses the ID supplied by the product ID generator', () => {
  const { useCase } = createUseCase(['product-generated-123']);

  const result = useCase.execute(validInput());

  assert.equal(result.product.id, 'product-generated-123');
});

test('preserves the inventory ID on the product', () => {
  const { useCase } = createUseCase();

  const result = useCase.execute(
    validInput({ inventoryId: 'inventory-offline-456' }),
  );

  assert.equal(result.product.inventoryId, 'inventory-offline-456');
});

test('returns zero inventory with an unknown cost', () => {
  const { useCase } = createUseCase();

  const result = useCase.execute(validInput());

  assert.deepEqual(result.inventory, { stock: 0, unitCost: null });
});

test('does not create an initial movement for zero stock', () => {
  const { useCase } = createUseCase();

  const result = useCase.execute(validInput());

  assert.equal(result.initialMovement, null);
});

test('creates a product with positive initial stock', () => {
  const { useCase } = createUseCase();

  const result = useCase.execute(
    validInput({
      initialStock: 20,
      initialUnitCost: Money.fromDecimal('0.9'),
    }),
  );

  assert.equal(result.product.name, 'Coca Cola');
});

test('returns the positive initial stock', () => {
  const { useCase } = createUseCase();

  const result = useCase.execute(
    validInput({
      initialStock: 20,
      initialUnitCost: Money.fromDecimal('0.9'),
    }),
  );

  assert.equal(result.inventory.stock, 20);
});

test('returns the exact initial inventory cost', () => {
  const { useCase } = createUseCase();
  const initialUnitCost = Money.fromDecimal('0.900001');

  const result = useCase.execute(
    validInput({ initialStock: 20, initialUnitCost }),
  );

  assert.strictEqual(result.inventory.unitCost, initialUnitCost);
});

test('returns an INITIAL_STOCK movement for positive stock', () => {
  const { useCase } = createUseCase();

  const result = useCase.execute(
    validInput({
      initialStock: 20,
      initialUnitCost: Money.fromDecimal('0.9'),
    }),
  );

  assert.equal(result.initialMovement?.type, 'INITIAL_STOCK');
});

test('uses the initial stock as the movement quantity', () => {
  const { useCase } = createUseCase();

  const result = useCase.execute(
    validInput({
      initialStock: 20,
      initialUnitCost: Money.fromDecimal('0.9'),
    }),
  );

  assert.equal(result.initialMovement?.quantityDelta, 20);
});

test('preserves the exact movement cost', () => {
  const { useCase } = createUseCase();
  const initialUnitCost = Money.fromDecimal('0.900001');

  const result = useCase.execute(
    validInput({ initialStock: 20, initialUnitCost }),
  );

  assert.strictEqual(result.initialMovement?.unitCost, initialUnitCost);
});

test('propagates the product variant', () => {
  const { useCase } = createUseCase();

  const result = useCase.execute(validInput({ variant: 'Zero / 500 ml' }));

  assert.equal(result.product.variant, 'Zero / 500 ml');
});

test('preserves leading zeroes in the barcode', () => {
  const { useCase } = createUseCase();

  const result = useCase.execute(validInput({ barcode: '000123456789' }));

  assert.equal(result.product.barcode, '000123456789');
});

test('propagates the regular sale price', () => {
  const { useCase } = createUseCase();
  const regularSalePrice = Money.fromDecimal('2.750001');

  const result = useCase.execute(validInput({ regularSalePrice }));

  assert.strictEqual(result.product.regularSalePrice, regularSalePrice);
});

test('propagates minimum stock', () => {
  const { useCase } = createUseCase();

  const result = useCase.execute(validInput({ minimumStock: 12 }));

  assert.equal(result.product.minimumStock, 12);
});

test('propagates an invalid product name error', () => {
  const { useCase } = createUseCase();

  assert.throws(
    () => useCase.execute(validInput({ name: '   ' })),
    /product name.*empty/i,
  );
});

test('propagates a negative initial stock error', () => {
  const { useCase } = createUseCase();

  assert.throws(
    () =>
      useCase.execute(
        validInput({
          initialStock: -1,
          initialUnitCost: Money.fromDecimal('1'),
        }),
      ),
    /initial stock.*negative/i,
  );
});

test('propagates a missing initial cost error for positive stock', () => {
  const { useCase } = createUseCase();

  assert.throws(
    () => useCase.execute(validInput({ initialStock: 1 })),
    /initial unit cost.*required.*positive/i,
  );
});

test('propagates a supplied cost error for zero stock', () => {
  const { useCase } = createUseCase();

  assert.throws(
    () =>
      useCase.execute(validInput({ initialUnitCost: Money.fromDecimal('1') })),
    /initial unit cost.*stock is zero/i,
  );
});

test('propagates a negative sale price error', () => {
  const { useCase } = createUseCase();

  assert.throws(
    () =>
      useCase.execute(
        validInput({ regularSalePrice: Money.fromDecimal('-0.000001') }),
      ),
    /regular sale price.*negative/i,
  );
});

test('invokes the product ID generator exactly once per execution', () => {
  const { useCase, generator } = createUseCase();

  useCase.execute(validInput());

  assert.equal(generator.calls, 1);
});

test('does not mutate Money inputs', () => {
  const { useCase } = createUseCase();
  const regularSalePrice = Money.fromDecimal('1.250001');
  const initialUnitCost = Money.fromDecimal('0.900001');

  useCase.execute(
    validInput({
      regularSalePrice,
      initialStock: 20,
      initialUnitCost,
    }),
  );

  assert.equal(regularSalePrice.scaledUnits, 1_250_001);
  assert.equal(initialUnitCost.scaledUnits, 900_001);
});

test('requests a new product ID for every execution', () => {
  const { useCase, generator } = createUseCase(['product-1', 'product-2']);

  const first = useCase.execute(validInput());
  const second = useCase.execute(validInput());

  assert.equal(first.product.id, 'product-1');
  assert.equal(second.product.id, 'product-2');
  assert.equal(generator.calls, 2);
});

test('has no SQLite package dependency', () => {
  const packageJson: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );

  assert.ok(packageJson !== null && typeof packageJson === 'object');
  assert.equal(
    JSON.stringify(packageJson).toLowerCase().includes('sqlite'),
    false,
  );
});

test('executes with only an ID generator and returns no persistence artifact', () => {
  const generator = new FakeProductIdGenerator(['product-123']);
  const useCase = new CreateProductUseCase(generator);

  const result = useCase.execute(validInput());

  assert.deepEqual(Object.keys(result).sort(), [
    'initialMovement',
    'inventory',
    'product',
  ]);
});
