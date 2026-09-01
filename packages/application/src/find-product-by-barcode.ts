import type { ProductBarcodeReader } from './ports';

export interface FindProductByBarcodeInput {
  readonly inventoryId: string;
  readonly barcode: string;
}

export interface ProductBarcodeMatch {
  readonly productId: string;
}

export class FindProductByBarcodeUseCase {
  constructor(private readonly productReader: ProductBarcodeReader) {}

  async execute({
    inventoryId,
    barcode,
  }: FindProductByBarcodeInput): Promise<ProductBarcodeMatch | null> {
    const normalizedBarcode = barcode.trim();

    if (normalizedBarcode.length === 0) return null;

    const product = await this.productReader.findActiveByBarcode(
      inventoryId,
      normalizedBarcode,
    );

    if (
      product === null ||
      product.inventoryId !== inventoryId ||
      product.isArchived ||
      product.barcode !== normalizedBarcode
    ) {
      return null;
    }

    return Object.freeze({ productId: product.id });
  }
}
