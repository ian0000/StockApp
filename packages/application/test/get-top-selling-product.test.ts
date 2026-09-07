import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GetTopSellingProductUseCase,
  type GetTopSellingProductInput,
  type TopSellingProduct,
  type TopSellingProductReader,
} from '../src/index';

const VALID_INPUT: GetTopSellingProductInput = {
  inventoryId: 'inventory-123',
  fromInclusive: 1_776_441_600_000,
  toExclusive: 1_776_528_000_000,
};

class StubTopSellingProductReader implements TopSellingProductReader {
  readonly calls: GetTopSellingProductInput[] = [];

  constructor(
    private readonly result: TopSellingProduct | null = null,
    private readonly error: Error | null = null,
  ) {}

  async getTopSellingProduct(
    input: GetTopSellingProductInput,
  ): Promise<TopSellingProduct | null> {
    this.calls.push(input);

    if (this.error !== null) throw this.error;
    return this.result;
  }
}

test('delegates a normalized inventory and valid half-open range', async () => {
  const reader = new StubTopSellingProductReader();
  const useCase = new GetTopSellingProductUseCase(reader);

  await useCase.execute({ ...VALID_INPUT, inventoryId: ' inventory-123 ' });

  assert.deepEqual(reader.calls, [VALID_INPUT]);
});

test('preserves an empty top-seller result', async () => {
  const useCase = new GetTopSellingProductUseCase(
    new StubTopSellingProductReader(),
  );

  assert.equal(await useCase.execute(VALID_INPUT), null);
});

test('preserves the exact product result from the reader', async () => {
  const topProduct: TopSellingProduct = Object.freeze({
    productId: 'product-b',
    name: 'Agua',
    variant: '500 ml',
    unitsSold: 5,
  });
  const useCase = new GetTopSellingProductUseCase(
    new StubTopSellingProductReader(topProduct),
  );

  assert.equal(await useCase.execute(VALID_INPUT), topProduct);
});

test('rejects an empty inventory identifier without reading', async () => {
  const reader = new StubTopSellingProductReader();
  const useCase = new GetTopSellingProductUseCase(reader);

  await assert.rejects(
    () => useCase.execute({ ...VALID_INPUT, inventoryId: '   ' }),
    /Inventory ID must not be empty/,
  );
  assert.equal(reader.calls.length, 0);
});

for (const [label, input] of [
  ['negative fromInclusive', { ...VALID_INPUT, fromInclusive: -1 }],
  ['fractional fromInclusive', { ...VALID_INPUT, fromInclusive: 1.5 }],
  [
    'unsafe toExclusive',
    { ...VALID_INPUT, toExclusive: Number.MAX_SAFE_INTEGER + 1 },
  ],
] as const) {
  test(`rejects ${label}`, async () => {
    const reader = new StubTopSellingProductReader();
    const useCase = new GetTopSellingProductUseCase(reader);

    await assert.rejects(() => useCase.execute(input), RangeError);
    assert.equal(reader.calls.length, 0);
  });
}

test('rejects empty and inverted ranges', async () => {
  const reader = new StubTopSellingProductReader();
  const useCase = new GetTopSellingProductUseCase(reader);

  await assert.rejects(
    () =>
      useCase.execute({
        ...VALID_INPUT,
        toExclusive: VALID_INPUT.fromInclusive,
      }),
    /To exclusive must be after from inclusive/,
  );
  await assert.rejects(
    () =>
      useCase.execute({
        ...VALID_INPUT,
        fromInclusive: VALID_INPUT.toExclusive,
        toExclusive: VALID_INPUT.fromInclusive,
      }),
    /To exclusive must be after from inclusive/,
  );
  assert.equal(reader.calls.length, 0);
});

test('propagates reader failures unchanged', async () => {
  const error = new Error('top seller read failed');
  const useCase = new GetTopSellingProductUseCase(
    new StubTopSellingProductReader(null, error),
  );

  await assert.rejects(() => useCase.execute(VALID_INPUT), error);
});
