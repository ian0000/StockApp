import { createTimestampMs, type TimestampMs } from '@stock-app/domain';

export interface GetTopSellingProductInput {
  readonly inventoryId: string;
  readonly fromInclusive: TimestampMs;
  readonly toExclusive: TimestampMs;
}

export interface TopSellingProduct {
  readonly productId: string;
  readonly name: string;
  readonly variant: string | null;
  readonly unitsSold: number;
}

export interface TopSellingProductReader {
  getTopSellingProduct(
    input: GetTopSellingProductInput,
  ): Promise<TopSellingProduct | null>;
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

export class GetTopSellingProductUseCase {
  constructor(private readonly reader: TopSellingProductReader) {}

  async execute({
    inventoryId,
    fromInclusive,
    toExclusive,
  }: GetTopSellingProductInput): Promise<TopSellingProduct | null> {
    const normalizedFrom = createTimestampMs(fromInclusive, 'From inclusive');
    const normalizedTo = createTimestampMs(toExclusive, 'To exclusive');

    if (normalizedTo <= normalizedFrom) {
      throw new RangeError('To exclusive must be after from inclusive.');
    }

    return this.reader.getTopSellingProduct(
      Object.freeze({
        inventoryId: normalizeInventoryId(inventoryId),
        fromInclusive: normalizedFrom,
        toExclusive: normalizedTo,
      }),
    );
  }
}
