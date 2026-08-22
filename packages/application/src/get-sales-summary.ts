import {
  createTimestampMs,
  type Money,
  type TimestampMs,
} from '@stock-app/domain';

export interface GetSalesSummaryInput {
  readonly inventoryId: string;
  readonly fromInclusive: TimestampMs;
  readonly toExclusive: TimestampMs;
}

export interface SalesSummary {
  readonly totalAmount: Money;
  readonly estimatedProfit: Money | null;
  readonly unitsSold: number;
}

export interface SalesSummaryReader {
  getSummary(input: GetSalesSummaryInput): Promise<SalesSummary>;
}

function normalizeInventoryId(inventoryId: string): string {
  if (typeof inventoryId !== 'string') {
    throw new TypeError('Inventory ID must be a string.');
  }

  const normalized = inventoryId.trim();

  if (normalized.length === 0) {
    throw new TypeError('Inventory ID must not be empty.');
  }

  return normalized;
}

export class GetSalesSummaryUseCase {
  constructor(private readonly reader: SalesSummaryReader) {}

  async execute({
    inventoryId,
    fromInclusive,
    toExclusive,
  }: GetSalesSummaryInput): Promise<SalesSummary> {
    const normalizedFrom = createTimestampMs(fromInclusive, 'From inclusive');
    const normalizedTo = createTimestampMs(toExclusive, 'To exclusive');

    if (normalizedTo <= normalizedFrom) {
      throw new RangeError('To exclusive must be after from inclusive.');
    }

    return this.reader.getSummary(
      Object.freeze({
        inventoryId: normalizeInventoryId(inventoryId),
        fromInclusive: normalizedFrom,
        toExclusive: normalizedTo,
      }),
    );
  }
}
