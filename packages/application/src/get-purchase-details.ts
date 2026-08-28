import type {
  Money,
  Purchase,
  PurchaseStatus,
  TimestampMs,
} from '@stock-app/domain';

export interface GetPurchaseDetailsInput {
  readonly inventoryId: string;
  readonly purchaseId: string;
}

export interface PurchaseDetailsReaderInput {
  readonly inventoryId: string;
  readonly purchaseId: string;
}

export interface PurchaseDetailsSource {
  readonly purchase: Purchase;
  readonly productName: string | null;
  readonly productVariant: string | null;
}

export interface PurchaseDetailsReader {
  findById(
    input: PurchaseDetailsReaderInput,
  ): Promise<PurchaseDetailsSource | null>;
}

export interface PurchaseDetails {
  readonly id: string;
  readonly productId: string;
  readonly productName: string | null;
  readonly productVariant: string | null;
  readonly quantity: number;
  readonly unitCost: Money;
  readonly totalAmount: Money;
  readonly effectiveAt: TimestampMs;
  readonly createdAt: TimestampMs;
  readonly status: PurchaseStatus;
  readonly notes: string | null;
  readonly averageCostBefore: Money | null;
  readonly averageCostAfter: Money;
  readonly stockBefore: number;
  readonly stockAfter: number;
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

function toDetails({
  purchase,
  productName,
  productVariant,
}: PurchaseDetailsSource): PurchaseDetails {
  return Object.freeze({
    id: purchase.id,
    productId: purchase.productId,
    productName,
    productVariant,
    quantity: purchase.quantity,
    unitCost: purchase.unitCost,
    totalAmount: purchase.totalAmount,
    effectiveAt: purchase.effectiveAt,
    createdAt: purchase.createdAt,
    status: purchase.status,
    notes: purchase.notes,
    averageCostBefore: purchase.averageCostBefore,
    averageCostAfter: purchase.averageCostAfter,
    stockBefore: purchase.stockBefore,
    stockAfter: purchase.stockAfter,
  });
}

export class GetPurchaseDetailsUseCase {
  constructor(private readonly reader: PurchaseDetailsReader) {}

  async execute({
    inventoryId,
    purchaseId,
  }: GetPurchaseDetailsInput): Promise<PurchaseDetails | null> {
    const normalizedInventoryId = normalizeIdentifier(
      inventoryId,
      'Inventory ID',
    );
    const normalizedPurchaseId = normalizeIdentifier(purchaseId, 'Purchase ID');
    const source = await this.reader.findById(
      Object.freeze({
        inventoryId: normalizedInventoryId,
        purchaseId: normalizedPurchaseId,
      }),
    );

    if (source === null) return null;

    if (
      source.purchase.inventoryId !== normalizedInventoryId ||
      source.purchase.id !== normalizedPurchaseId
    ) {
      throw new Error(
        'Purchase details reader returned an out-of-scope Purchase.',
      );
    }

    return toDetails(source);
  }
}
