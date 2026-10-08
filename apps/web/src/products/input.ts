import { Money } from '@stock-app/domain';
import {
  DOMAIN_VERSION,
  PROTOCOL_VERSION,
  decodeMoney,
  encodeMoney,
} from '@stock-app/contracts/transport';
import type { CreateProductCommand } from '@stock-app/contracts';
import { v7 } from 'uuid';
import validateCommand from '../api/generated/create-product-command.mjs';

export function initialProductForm(barcode = '') {
  return {
    name: '',
    variant: '',
    barcode,
    regularSalePrice: '',
    minimumStock: '',
    initialStock: '0',
    initialUnitCost: '',
  };
}
export type ProductForm = ReturnType<typeof initialProductForm>;
export class ProductFormError extends Error {
  constructor(
    readonly field: keyof ProductForm,
    message: string,
  ) {
    super(message);
  }
}
export function integer(text: string, field: keyof ProductForm) {
  if (!/^\d+$/.test(text.trim()))
    throw new ProductFormError(
      field,
      'Escribe un número entero igual o mayor que cero.',
    );
  const value = Number(text.trim());
  if (!Number.isSafeInteger(value))
    throw new ProductFormError(field, 'La cantidad es demasiado grande.');
  return value;
}
export function amount(text: string, field: keyof ProductForm) {
  try {
    const value = Money.fromDecimal(text.trim());
    if (value.compare(Money.zero()) < 0) throw new RangeError();
    return encodeMoney(value.scaledUnits);
  } catch {
    throw new ProductFormError(
      field,
      'Escribe un importe igual o mayor que cero, con hasta seis decimales.',
    );
  }
}
export function parseProductForm(form: ProductForm) {
  const name = form.name.trim();
  if (!name)
    throw new ProductFormError('name', 'Escribe el nombre del producto.');
  const initialStock = integer(form.initialStock, 'initialStock');
  return {
    name,
    variant: form.variant.trim() || null,
    barcode: form.barcode.trim() || null,
    regularSalePrice: amount(form.regularSalePrice, 'regularSalePrice'),
    minimumStock:
      form.minimumStock.trim() === ''
        ? null
        : integer(form.minimumStock, 'minimumStock'),
    initialStock,
    initialUnitCost:
      initialStock > 0 ? amount(form.initialUnitCost, 'initialUnitCost') : null,
  };
}
export function buildProductCommand(form: ProductForm): CreateProductCommand {
  const payload = parseProductForm(form);
  const now = Date.now();
  const command = {
    protocolVersion: PROTOCOL_VERSION,
    domainVersion: DOMAIN_VERSION,
    commandKind: 'PRODUCT_CREATE',
    operationId: v7(),
    occurredAt: now,
    dependsOn: [],
    preconditions: {},
    payload: {
      ...payload,
      productId: v7(),
      initialMovementId: payload.initialStock > 0 ? v7() : null,
      createdAt: now,
    },
  };
  if (!validateCommand(command))
    throw new ProductFormError('name', 'Revisa los datos del producto.');
  return command;
}
export function formatMoney(value: string | null): string {
  if (value === null) return 'No disponible';
  // Domain performs exact half-away-from-zero division. Formatting never edits the source DTO.
  const cents = Money.fromScaledUnits(decodeMoney(value)).divideByInteger(
    10_000,
  ).scaledUnits;
  const digits = String(Math.abs(cents)).padStart(3, '0');
  return `${cents < 0 ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
