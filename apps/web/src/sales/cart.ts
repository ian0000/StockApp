import type { ProductReadDto, RegisterSaleCommand } from '@stock-app/contracts';
import { Money, calculateEstimatedProfit } from '@stock-app/domain';
import {
  decodeMoney,
  encodeMoney,
  PROTOCOL_VERSION,
  DOMAIN_VERSION,
} from '@stock-app/contracts/transport';
import { v7 } from 'uuid';
import validateSale from '../api/generated/register-sale-command.mjs';
import { formatMoney } from '../products/input.js';

export type CartLine = {
  productId: string;
  name: string;
  variant: string | null;
  stock: number;
  quantity: number;
  unitSalePrice: Money;
  priceText: string;
  priceDirty: boolean;
  priceError: string | null;
};
export function addProduct(
  cart: readonly CartLine[],
  read: ProductReadDto,
): CartLine[] {
  const id = read.product.id;
  if (cart.some((line) => line.productId.toLowerCase() === id.toLowerCase()))
    return changeQuantity(cart, id, 1);
  const price = Money.fromScaledUnits(
    decodeMoney(read.product.regularSalePrice),
  );
  return [
    ...cart,
    {
      productId: id,
      name: read.product.name,
      variant: read.product.variant,
      stock: read.state.stock,
      quantity: 1,
      unitSalePrice: price,
      priceText: formatMoney(read.product.regularSalePrice),
      priceDirty: false,
      priceError:
        price.compare(Money.zero()) > 0
          ? null
          : 'Usa un precio de venta mayor que cero.',
    },
  ];
}
export function removeLine(cart: readonly CartLine[], id: string) {
  return cart.filter(
    (line) => line.productId.toLowerCase() !== id.toLowerCase(),
  );
}
export function changeQuantity(
  cart: readonly CartLine[],
  id: string,
  delta: -1 | 1,
): CartLine[] {
  return cart.flatMap((line) => {
    if (line.productId.toLowerCase() !== id.toLowerCase()) return [line];
    const quantity = line.quantity + delta;
    if (quantity === 0) return [];
    if (!Number.isSafeInteger(quantity) || quantity < 1)
      throw new Error('La cantidad es demasiado grande.');
    return [{ ...line, quantity }];
  });
}
export function editPrice(
  cart: readonly CartLine[],
  id: string,
  text: string,
): CartLine[] {
  return cart.map((line) => {
    if (line.productId.toLowerCase() !== id.toLowerCase()) return line;
    let price = line.unitSalePrice,
      priceError: string | null = null;
    try {
      const parsed = Money.fromDecimal(text.trim().replace(',', '.'));
      if (parsed.compare(Money.zero()) <= 0)
        priceError = 'Usa un precio de venta mayor que cero.';
      else price = parsed;
    } catch {
      priceError = 'Usa un precio de venta válido, con hasta seis decimales.';
    }
    return {
      ...line,
      unitSalePrice: price,
      priceText: text,
      priceDirty: true,
      priceError,
    };
  });
}
export function cartTotal(cart: readonly CartLine[]): Money {
  return cart.reduce((total, line) => {
    if (
      line.priceError ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      line.unitSalePrice.compare(Money.zero()) <= 0
    )
      throw new Error(
        line.priceError ?? 'Revisa la cantidad y el precio de venta.',
      );
    return total.add(line.unitSalePrice.multiplyByInteger(line.quantity));
  }, Money.zero());
}
export function prepareSale(
  cart: readonly CartLine[],
  reads: readonly ProductReadDto[],
): { command: RegisterSaleCommand; warnings: StockWarning[] } {
  if (!cart.length) throw new Error('Agrega un producto a la venta.');
  cartTotal(cart);
  const ids = new Set(cart.map((line) => line.productId.toLowerCase()));
  if (ids.size !== cart.length)
    throw new Error('Revisa los productos de la venta.');
  const now = Date.now(),
    warnings: StockWarning[] = [];
  const expectedCosts = cart.map((line) => {
    const read = reads.find(
      (p) => p.product.id.toLowerCase() === line.productId.toLowerCase(),
    );
    if (!read || read.product.isArchived)
      throw new Error('Producto no disponible.');
    const resultingStock = read.state.stock - line.quantity;
    if (!Number.isSafeInteger(resultingStock))
      throw new Error('La cantidad es demasiado grande para este inventario.');
    if (resultingStock < 0)
      warnings.push({
        productId: line.productId,
        name: read.product.name,
        stock: read.state.stock,
        quantity: line.quantity,
        resultingStock,
      });
    const unitCostSnapshot = read.state.unitCost;
    const cost =
      unitCostSnapshot === null
        ? null
        : Money.fromScaledUnits(
            decodeMoney(unitCostSnapshot),
          ).multiplyByInteger(line.quantity);
    const profit =
      cost === null
        ? null
        : calculateEstimatedProfit({
            salePrice: line.unitSalePrice.multiplyByInteger(line.quantity),
            estimatedUnitCost: cost,
          });
    return {
      productId: line.productId,
      unitCostSnapshot,
      estimatedCost: cost === null ? null : encodeMoney(cost.scaledUnits),
      estimatedProfit: profit === null ? null : encodeMoney(profit.scaledUnits),
    };
  });
  // Unknown aggregate cost stays null; never sum a partial known subset.
  if (expectedCosts.every((e) => e.estimatedCost !== null))
    expectedCosts.reduce(
      (total, e) =>
        total.add(Money.fromScaledUnits(decodeMoney(e.estimatedCost))),
      Money.zero(),
    );
  const command = {
    protocolVersion: PROTOCOL_VERSION,
    domainVersion: DOMAIN_VERSION,
    commandKind: 'SALE_REGISTER',
    operationId: v7(),
    occurredAt: now,
    dependsOn: [],
    payload: {
      saleId: v7(),
      createdAt: now,
      notes: null,
      items: cart.map((line) => ({
        productId: line.productId,
        saleItemId: v7(),
        movementId: v7(),
        quantity: line.quantity,
        unitSalePrice: encodeMoney(line.unitSalePrice.scaledUnits),
      })),
    },
    preconditions: { expectedCosts },
  };
  if (!validateSale(command)) throw new Error('Revisa los datos de la venta.');
  return { command, warnings };
}
export type StockWarning = {
  productId: string;
  name: string;
  stock: number;
  quantity: number;
  resultingStock: number;
};
