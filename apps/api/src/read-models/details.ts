import { and, eq, gte, inArray, ne, or } from 'drizzle-orm';
import {
  createInventoryState,
  prepareSaleReversal,
  preparePurchaseReversal,
  type InventoryMovement,
} from '@stock-app/domain';
import type { SaleDetailDto, PurchaseDetailDto } from '@stock-app/contracts';
import {
  sales,
  saleItems,
  products,
  purchases,
  inventoryMovements,
  inventoryStates,
} from '../infrastructure/postgres/schema.js';
import {
  saleFromRow,
  itemFromRow,
  movementFromRow,
} from '../void-sales/mappers.js';
import { purchaseFromRow } from '../void-purchases/mappers.js';
import { saleDto, saleItemDto, stateFromRow } from '../sales/mappers.js';
import { purchaseDto } from '../purchases/mappers.js';
import type { ReadDatabase } from './products.js';

type Eligibility = SaleDetailDto['voidEligibility'];
async function existingReversal(
  db: ReadDatabase,
  inventoryId: string,
  originals: readonly InventoryMovement[],
) {
  const ids = originals.map((m) => m.id);
  if (!ids.length) throw new Error('Missing original operation movements.');
  const [row] = await db
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.inventoryId, inventoryId),
        eq(inventoryMovements.type, 'REVERSAL'),
        or(
          inArray(inventoryMovements.reversalOfMovementId, ids),
          and(
            eq(inventoryMovements.sourceType, 'INVENTORY_MOVEMENT'),
            inArray(inventoryMovements.sourceId, ids),
          ),
        ),
      ),
    )
    .limit(1);
  if (row) throw new Error('CONFIRMED operation already has a reversal.');
}
async function subsequent(
  db: ReadDatabase,
  inventoryId: string,
  originals: readonly InventoryMovement[],
) {
  const [row] = await db
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.inventoryId, inventoryId),
        or(
          ...originals.map((m) =>
            and(
              eq(inventoryMovements.productId, m.productId),
              gte(inventoryMovements.createdAt, BigInt(m.createdAt)),
              ne(inventoryMovements.id, m.id),
            ),
          ),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}
async function currentStates(
  db: ReadDatabase,
  inventoryId: string,
  productIds: string[],
) {
  const rows = await db
    .select()
    .from(inventoryStates)
    .where(
      and(
        eq(inventoryStates.inventoryId, inventoryId),
        inArray(inventoryStates.productId, productIds),
      ),
    );
  if (rows.length !== productIds.length)
    throw new Error('Missing scoped historical operation State.');
  return rows.map((row) => ({
    productId: row.productId,
    state: stateFromRow(row),
  }));
}
export async function readSaleDetail(
  db: ReadDatabase,
  inventoryId: string,
  saleId: string,
): Promise<SaleDetailDto | null> {
  const [row] = await db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.inventoryId, inventoryId),
        eq(sales.id, saleId.toLowerCase()),
      ),
    )
    .limit(1);
  if (!row) return null;
  const sale = saleFromRow(row),
    itemRows = await db
      .select({
        item: saleItems,
        productName: products.name,
        productVariant: products.variant,
      })
      .from(saleItems)
      .leftJoin(
        products,
        and(
          eq(products.inventoryId, inventoryId),
          eq(products.inventoryId, saleItems.inventoryId),
          eq(products.id, saleItems.productId),
        ),
      )
      .where(
        and(
          eq(saleItems.inventoryId, inventoryId),
          eq(saleItems.saleId, sale.id),
        ),
      )
      .orderBy(saleItems.id);
  if (!itemRows.length) throw new Error('Missing historical SaleItems.');
  const items = itemRows.map((r) => ({
    ...saleItemDto(itemFromRow(r.item), inventoryId),
    productName: r.productName,
    productVariant: r.productVariant,
  }));
  let voidEligibility: Eligibility = { eligible: false, reason: null };
  // VOIDED is terminal and readable: no fictional reversal or current-State eligibility simulation.
  if (sale.status === 'CONFIRMED') {
    const states = await currentStates(db, inventoryId, [
      ...new Set(itemRows.map((r) => r.item.productId)),
    ]);
    const originals = (
      await db
        .select()
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.inventoryId, inventoryId),
            eq(inventoryMovements.type, 'SALE'),
            eq(inventoryMovements.sourceType, 'SALE'),
            eq(inventoryMovements.sourceId, sale.id),
          ),
        )
        .limit(items.length + 1)
    ).map(movementFromRow);
    // Pure Domain validates the immutable original ledger against its recorded outcome, without writes.
    prepareSaleReversal({
      sale,
      saleItems: itemRows.map((r) => itemFromRow(r.item)),
      originalMovements: originals,
      currentInventoryStates: originals.map((m) => ({
        productId: m.productId,
        state: createInventoryState({
          stock: m.stockAfter,
          unitCost: m.unitCostSnapshot,
        }),
      })),
      voidedAt: sale.updatedAt,
    });
    await existingReversal(db, inventoryId, originals);
    if (await subsequent(db, inventoryId, originals))
      voidEligibility = {
        eligible: false,
        reason: 'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT',
      };
    else {
      const matches = originals.every((m) => {
        const state = states.find((s) => s.productId === m.productId)!.state;
        return (
          state.stock === m.stockAfter &&
          (state.unitCost === null || m.unitCostSnapshot === null
            ? state.unitCost === m.unitCostSnapshot
            : state.unitCost.equals(m.unitCostSnapshot))
        );
      });
      voidEligibility = matches
        ? { eligible: true, reason: null }
        : { eligible: false, reason: 'CURRENT_STATE_MISMATCH' };
    }
  }
  return { sale: saleDto(sale), items, voidEligibility };
}
export async function readPurchaseDetail(
  db: ReadDatabase,
  inventoryId: string,
  purchaseId: string,
): Promise<PurchaseDetailDto | null> {
  const [row] = await db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.inventoryId, inventoryId),
        eq(purchases.id, purchaseId.toLowerCase()),
      ),
    )
    .limit(1);
  if (!row) return null;
  const purchase = purchaseFromRow(row);
  let voidEligibility: Eligibility = { eligible: false, reason: null };
  if (purchase.status === 'CONFIRMED') {
    const state = (
      await currentStates(db, inventoryId, [purchase.productId])
    )[0].state;
    const originals = (
      await db
        .select()
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.inventoryId, inventoryId),
            eq(inventoryMovements.type, 'PURCHASE'),
            eq(inventoryMovements.sourceType, 'PURCHASE'),
            eq(inventoryMovements.sourceId, purchase.id),
          ),
        )
        .limit(2)
    ).map(movementFromRow);
    if (originals.length !== 1)
      throw new Error('Missing or ambiguous Purchase original.');
    preparePurchaseReversal({
      purchase,
      originalMovement: originals[0],
      currentInventoryState: createInventoryState({
        stock: purchase.stockAfter,
        unitCost: purchase.averageCostAfter,
      }),
      voidedAt: purchase.updatedAt,
    });
    await existingReversal(db, inventoryId, originals);
    if (await subsequent(db, inventoryId, originals))
      voidEligibility = {
        eligible: false,
        reason: 'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT',
      };
    else {
      voidEligibility =
        state.stock === purchase.stockAfter &&
        state.unitCost !== null &&
        state.unitCost.equals(purchase.averageCostAfter)
          ? { eligible: true, reason: null }
          : { eligible: false, reason: 'CURRENT_STATE_MISMATCH' };
    }
  }
  return { purchase: purchaseDto(purchase), voidEligibility };
}
