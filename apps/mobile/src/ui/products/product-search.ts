import type { ProductSummary } from '@stock-app/application';

export function normalizeProductSearchText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function filterProductSummaries(
  products: readonly ProductSummary[],
  query: string,
): readonly ProductSummary[] {
  const activeProducts = products.filter(({ product }) => !product.isArchived);
  const textQuery = normalizeProductSearchText(query);

  if (textQuery.length === 0) return activeProducts;

  const barcodeQuery = query.trim();

  return activeProducts.filter(({ product }) => {
    const nameMatches = normalizeProductSearchText(product.name).includes(
      textQuery,
    );
    const variantMatches = product.variant
      ? normalizeProductSearchText(product.variant).includes(textQuery)
      : false;
    const barcodeMatches = product.barcode === barcodeQuery;

    return nameMatches || variantMatches || barcodeMatches;
  });
}
