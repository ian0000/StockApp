import type {
  ProductDto,
  UpdateProductCommand,
  ArchiveProductCommand,
} from '@stock-app/contracts';
import {
  DOMAIN_VERSION,
  PROTOCOL_VERSION,
  decodePercentage,
} from '@stock-app/contracts/transport';
import { Percentage } from '@stock-app/domain';
import { v7 } from 'uuid';
import validateUpdate from '../api/generated/update-product-command.mjs';
import validateArchive from '../api/generated/archive-product-command.mjs';
import { amount, integer, formatMoney, ProductFormError } from './input.js';

export const metadataFields = [
  'name',
  'variant',
  'barcode',
  'regularSalePrice',
  'minimumStock',
] as const;
export type MetadataField = (typeof metadataFields)[number];
export type ProductEditDraft = {
  original: ProductDto;
  text: Record<MetadataField, string>;
  dirty: Record<MetadataField, boolean>;
};
export function initialEditDraft(product: ProductDto): ProductEditDraft {
  return {
    original: product,
    text: {
      name: product.name,
      variant: product.variant ?? '',
      barcode: product.barcode ?? '',
      regularSalePrice: formatMoney(product.regularSalePrice),
      minimumStock:
        product.minimumStock === null ? '' : String(product.minimumStock),
    },
    dirty: {
      name: false,
      variant: false,
      barcode: false,
      regularSalePrice: false,
      minimumStock: false,
    },
  };
}
export function editField(
  draft: ProductEditDraft,
  field: MetadataField,
  text: string,
): ProductEditDraft {
  return {
    ...draft,
    text: { ...draft.text, [field]: text },
    dirty: { ...draft.dirty, [field]: true },
  };
}
export function rebaseDraft(
  draft: ProductEditDraft,
  latest: ProductDto,
): ProductEditDraft {
  if (
    draft.original.id.toLowerCase() !== latest.id.toLowerCase() ||
    draft.original.inventoryId.toLowerCase() !==
      latest.inventoryId.toLowerCase()
  )
    throw new ProductFormError(
      'name',
      'No pudimos revisar esta versión del producto.',
    );
  const next = initialEditDraft(latest);
  for (const field of metadataFields)
    if (draft.dirty[field]) {
      next.text[field] = draft.text[field];
      next.dirty[field] = true;
    }
  return next;
}
export function buildUpdateCommand(
  draft: ProductEditDraft,
): UpdateProductCommand {
  const { original, text, dirty } = draft;
  const name = dirty.name ? text.name.trim() : original.name;
  if (!name)
    throw new ProductFormError('name', 'Escribe el nombre del producto.');
  const command = {
    protocolVersion: PROTOCOL_VERSION,
    domainVersion: DOMAIN_VERSION,
    commandKind: 'PRODUCT_UPDATE',
    operationId: v7(),
    occurredAt: Date.now(),
    dependsOn: [],
    payload: {
      productId: original.id,
      name,
      variant: dirty.variant ? text.variant.trim() || null : original.variant,
      barcode: dirty.barcode ? text.barcode.trim() || null : original.barcode,
      regularSalePrice: dirty.regularSalePrice
        ? amount(text.regularSalePrice, 'regularSalePrice')
        : original.regularSalePrice,
      minimumStock: dirty.minimumStock
        ? text.minimumStock.trim() === ''
          ? null
          : integer(text.minimumStock, 'minimumStock')
        : original.minimumStock,
    },
    preconditions: { expectedMetadataRevision: original.metadataRevision },
  };
  if (!validateUpdate(command))
    throw new ProductFormError('name', 'Revisa los datos del producto.');
  return command;
}
export function buildArchiveCommand(
  product: ProductDto,
): ArchiveProductCommand {
  const command = {
    protocolVersion: PROTOCOL_VERSION,
    domainVersion: DOMAIN_VERSION,
    commandKind: 'PRODUCT_ARCHIVE',
    operationId: v7(),
    occurredAt: Date.now(),
    dependsOn: [],
    payload: { productId: product.id },
    preconditions: { expectedMetadataRevision: product.metadataRevision },
  };
  if (!validateArchive(command))
    throw new ProductFormError(
      'name',
      'No pudimos preparar el archivo del producto.',
    );
  return command;
}
export function formatPercentage(value: string | null) {
  if (value === null) return 'No disponible';
  const exact = Percentage.fromScaledUnits(decodePercentage(value));
  // The same exact Domain rounding used for Money display applies to scaled percentage points.
  return `${formatMoney(String(exact.scaledUnits))}%`;
}
