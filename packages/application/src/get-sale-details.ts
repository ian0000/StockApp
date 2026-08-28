import type {
  CostStatus,
  Money,
  Sale,
  SaleItem,
  SaleStatus,
  TimestampMs,
} from '@stock-app/domain';

export interface GetSaleDetailsInput {
  readonly inventoryId: string;
  readonly saleId: string;
}

export interface SaleDetailsReaderInput {
  readonly inventoryId: string;
  readonly saleId: string;
}

export interface SaleDetailsSourceItem {
  readonly item: SaleItem;
  readonly productName: string | null;
  readonly productVariant: string | null;
}

export interface SaleDetailsSource {
  readonly sale: Sale;
  readonly items: readonly SaleDetailsSourceItem[];
}

export interface SaleDetailsReader {
  findById(input: SaleDetailsReaderInput): Promise<SaleDetailsSource | null>;
}

export interface SaleDetailsItem {
  readonly id: string;
  readonly productId: string;
  readonly productName: string | null;
  readonly productVariant: string | null;
  readonly quantity: number;
  readonly unitSalePrice: Money;
  readonly subtotal: Money;
  readonly unitCostSnapshot: Money | null;
  readonly estimatedCost: Money | null;
  readonly estimatedProfit: Money | null;
  readonly costStatus: CostStatus;
}

export interface SaleDetails {
  readonly id: string;
  readonly effectiveAt: TimestampMs;
  readonly createdAt: TimestampMs;
  readonly status: SaleStatus;
  readonly totalAmount: Money;
  readonly estimatedCost: Money | null;
  readonly estimatedProfit: Money | null;
  readonly notes: string | null;
  readonly totalUnits: number;
  readonly items: readonly SaleDetailsItem[];
}

function normalizeIdentifier(value: string, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string.`);
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }

  return normalized;
}

function addUnits(total: number, quantity: number): number {
  const next = total + quantity;

  if (!Number.isSafeInteger(next)) {
    throw new RangeError('Sale total units must be a safe integer.');
  }

  return next;
}

function toDetails(source: SaleDetailsSource): SaleDetails {
  if (source.items.length === 0) {
    throw new Error('Sale details must contain at least one item.');
  }

  const items = source.items.map(({ item, productName, productVariant }) => {
    if (item.saleId !== source.sale.id) {
      throw new Error('Sale item does not belong to the requested Sale.');
    }

    return Object.freeze({
      id: item.id,
      productId: item.productId,
      productName,
      productVariant,
      quantity: item.quantity,
      unitSalePrice: item.unitSalePrice,
      subtotal: item.subtotal,
      unitCostSnapshot: item.unitCostSnapshot,
      estimatedCost: item.estimatedCost,
      estimatedProfit: item.estimatedProfit,
      costStatus: item.costStatus,
    });
  });
  const totalUnits = items.reduce(
    (total, item) => addUnits(total, item.quantity),
    0,
  );

  return Object.freeze({
    id: source.sale.id,
    effectiveAt: source.sale.effectiveAt,
    createdAt: source.sale.createdAt,
    status: source.sale.status,
    totalAmount: source.sale.totalAmount,
    estimatedCost: source.sale.estimatedCost,
    estimatedProfit: source.sale.estimatedProfit,
    notes: source.sale.notes,
    totalUnits,
    items: Object.freeze(items),
  });
}

export class GetSaleDetailsUseCase {
  constructor(private readonly reader: SaleDetailsReader) {}

  async execute({
    inventoryId,
    saleId,
  }: GetSaleDetailsInput): Promise<SaleDetails | null> {
    const normalizedInventoryId = normalizeIdentifier(
      inventoryId,
      'Inventory ID',
    );
    const normalizedSaleId = normalizeIdentifier(saleId, 'Sale ID');
    const source = await this.reader.findById(
      Object.freeze({
        inventoryId: normalizedInventoryId,
        saleId: normalizedSaleId,
      }),
    );

    if (source === null) return null;

    if (
      source.sale.inventoryId !== normalizedInventoryId ||
      source.sale.id !== normalizedSaleId
    ) {
      throw new Error('Sale details reader returned an out-of-scope Sale.');
    }

    return toDetails(source);
  }
}
