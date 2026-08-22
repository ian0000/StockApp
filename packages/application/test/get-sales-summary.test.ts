import assert from 'node:assert/strict';
import test from 'node:test';

import { Money } from '@stock-app/domain';

import {
  GetSalesSummaryUseCase,
  type GetSalesSummaryInput,
  type SalesSummary,
  type SalesSummaryReader,
} from '../src/index';

const VALID_INPUT: GetSalesSummaryInput = {
  inventoryId: 'inventory-123',
  fromInclusive: 1_776_441_600_000,
  toExclusive: 1_776_528_000_000,
};

const ZERO_SUMMARY: SalesSummary = {
  totalAmount: Money.zero(),
  estimatedProfit: Money.zero(),
  unitsSold: 0,
};

class StubSalesSummaryReader implements SalesSummaryReader {
  readonly calls: GetSalesSummaryInput[] = [];

  constructor(
    private readonly result: SalesSummary = ZERO_SUMMARY,
    private readonly error: Error | null = null,
  ) {}

  async getSummary(input: GetSalesSummaryInput): Promise<SalesSummary> {
    this.calls.push(input);

    if (this.error !== null) {
      throw this.error;
    }

    return this.result;
  }
}

test('delegates a valid range to the summary reader', async () => {
  const reader = new StubSalesSummaryReader();
  const useCase = new GetSalesSummaryUseCase(reader);

  await useCase.execute(VALID_INPUT);

  assert.deepEqual(reader.calls, [VALID_INPUT]);
});

test('trims the inventory identifier before reading', async () => {
  const reader = new StubSalesSummaryReader();
  const useCase = new GetSalesSummaryUseCase(reader);

  await useCase.execute({ ...VALID_INPUT, inventoryId: '  inventory-123  ' });

  assert.equal(reader.calls[0]?.inventoryId, 'inventory-123');
});

test('rejects an empty inventory identifier without reading', async () => {
  const reader = new StubSalesSummaryReader();
  const useCase = new GetSalesSummaryUseCase(reader);

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
    const reader = new StubSalesSummaryReader();
    const useCase = new GetSalesSummaryUseCase(reader);

    await assert.rejects(() => useCase.execute(input), RangeError);
    assert.equal(reader.calls.length, 0);
  });
}

test('rejects an inverted range', async () => {
  const reader = new StubSalesSummaryReader();
  const useCase = new GetSalesSummaryUseCase(reader);

  await assert.rejects(
    () =>
      useCase.execute({
        ...VALID_INPUT,
        fromInclusive: VALID_INPUT.toExclusive,
        toExclusive: VALID_INPUT.fromInclusive,
      }),
    /To exclusive must be after from inclusive/,
  );
});

test('rejects an empty range', async () => {
  const reader = new StubSalesSummaryReader();
  const useCase = new GetSalesSummaryUseCase(reader);

  await assert.rejects(
    () =>
      useCase.execute({
        ...VALID_INPUT,
        toExclusive: VALID_INPUT.fromInclusive,
      }),
    /To exclusive must be after from inclusive/,
  );
});

test('preserves the exact Money and unit result from the reader', async () => {
  const summary: SalesSummary = {
    totalAmount: Money.fromDecimal('3.50'),
    estimatedProfit: Money.fromDecimal('1.15'),
    unitsSold: 5,
  };
  const useCase = new GetSalesSummaryUseCase(
    new StubSalesSummaryReader(summary),
  );

  const result = await useCase.execute(VALID_INPUT);

  assert.equal(result, summary);
  assert.equal(result.totalAmount.scaledUnits, 3_500_000);
  assert.equal(result.estimatedProfit?.scaledUnits, 1_150_000);
  assert.equal(result.unitsSold, 5);
});

test('preserves the zero-sales summary', async () => {
  const useCase = new GetSalesSummaryUseCase(
    new StubSalesSummaryReader(ZERO_SUMMARY),
  );

  const result = await useCase.execute(VALID_INPUT);

  assert.equal(result.totalAmount.scaledUnits, 0);
  assert.equal(result.estimatedProfit?.scaledUnits, 0);
  assert.equal(result.unitsSold, 0);
});

test('propagates reader failures unchanged', async () => {
  const error = new Error('summary read failed');
  const useCase = new GetSalesSummaryUseCase(
    new StubSalesSummaryReader(ZERO_SUMMARY, error),
  );

  await assert.rejects(() => useCase.execute(VALID_INPUT), error);
});
