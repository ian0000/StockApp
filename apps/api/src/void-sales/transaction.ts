import { and, eq, gte, inArray, or } from 'drizzle-orm';
import type {
  TransactionManager,
  TransactionRepositories,
  UpdateInventoryStateInput,
} from '@stock-app/application';
import type { InventoryMovement, Sale } from '@stock-app/domain';
import type { VoidSaleCommand } from '@stock-app/contracts';
import {
  sales,
  saleItems,
  inventoryMovements,
  inventoryStates,
} from '../infrastructure/postgres/schema.js';
import type { CommandTransaction } from '../infrastructure/postgres/command-executor.js';
import type { CommandChanges } from '../infrastructure/postgres/change-sets.js';
import { stateFromRow, saleDto, moneyTransport } from '../sales/mappers.js';
import { movementValues, movementDto, stateDto } from '../products/mappers.js';
import {
  saleFromRow,
  itemFromRow,
  movementFromRow,
  loadOriginalSaleMovements,
} from './mappers.js';

async function unavailable(): Promise<never> {
  throw new Error('Unsupported Sale void repository operation.');
}
export async function createBoundVoidSaleTransaction(
  tx: CommandTransaction,
  inventoryId: string,
  command: VoidSaleCommand,
) {
  const saleId = command.payload.saleId.toLowerCase();
  const [row] = await tx
    .select()
    .from(sales)
    .where(and(eq(sales.inventoryId, inventoryId), eq(sales.id, saleId)));
  if (!row) return null;
  const sale = saleFromRow(row),
    items = (
      await tx
        .select()
        .from(saleItems)
        .where(
          and(
            eq(saleItems.inventoryId, inventoryId),
            eq(saleItems.saleId, saleId),
          ),
        )
    ).map(itemFromRow);
  const stateRows = await tx
      .select()
      .from(inventoryStates)
      .where(eq(inventoryStates.inventoryId, inventoryId)),
    stateRecords = stateRows.map((state) => ({
      inventoryId,
      productId: state.productId,
      state: stateFromRow(state),
    }));
  const reversals: InventoryMovement[] = [],
    states: UpdateInventoryStateInput[] = [];
  let updatedSale: Sale | undefined,
    invoked = false;
  function checkInventory(scope: string) {
    if (scope !== inventoryId) throw new Error('Invalid Sale void scope.');
  }
  function checkSale(id: string) {
    if (id !== saleId) throw new Error('Invalid Sale void identity.');
  }
  const transactionManager: TransactionManager = {
    async runInTransaction(operation) {
      if (invoked)
        throw new Error('Sale void transaction invoked more than once.');
      invoked = true;
      const repositories: TransactionRepositories = {
        productRepository: { save: unavailable, listByInventory: unavailable },
        inventoryStateRepository: {
          save: unavailable,
          update: unavailable,
          listByInventory: unavailable,
        },
        inventoryMovementRepository: { save: unavailable },
        saleRepository: { save: unavailable },
        saleItemRepository: { save: unavailable },
        purchaseRepository: { save: unavailable },
        stockAdjustmentRepository: { save: unavailable },
        purchaseVoidRepository: {
          findPurchase: unavailable,
          listOriginalPurchaseMovements: unavailable,
          listReversals: unavailable,
          listProductMovementsAtOrAfter: unavailable,
          listInventoryStates: unavailable,
          saveReversal: unavailable,
          updateInventoryState: unavailable,
          updatePurchase: unavailable,
        },
        saleVoidRepository: {
          async findSale(scope, id) {
            checkInventory(scope);
            checkSale(id);
            return sale;
          },
          async listSaleItems(id) {
            checkSale(id);
            return items;
          },
          async listOriginalSaleMovements(scope, id) {
            checkInventory(scope);
            checkSale(id);
            return loadOriginalSaleMovements(tx, inventoryId, saleId);
          },
          async listReversals(scope, originalIds) {
            checkInventory(scope);
            if (!originalIds.length) return [];
            const rows = await tx
              .select()
              .from(inventoryMovements)
              .where(
                and(
                  eq(inventoryMovements.inventoryId, inventoryId),
                  eq(inventoryMovements.type, 'REVERSAL'),
                  or(
                    inArray(inventoryMovements.reversalOfMovementId, [
                      ...originalIds,
                    ]),
                    and(
                      eq(inventoryMovements.sourceType, 'INVENTORY_MOVEMENT'),
                      inArray(inventoryMovements.sourceId, [...originalIds]),
                    ),
                  ),
                ),
              );
            return rows.map(movementFromRow);
          },
          async listProductMovementsAtOrAfter(input) {
            checkInventory(input.inventoryId);
            return (
              await tx
                .select()
                .from(inventoryMovements)
                .where(
                  and(
                    eq(inventoryMovements.inventoryId, inventoryId),
                    eq(inventoryMovements.productId, input.productId),
                    gte(inventoryMovements.createdAt, BigInt(input.createdAt)),
                  ),
                )
            ).map(movementFromRow);
          },
          async listInventoryStates(scope) {
            checkInventory(scope);
            return stateRecords;
          },
          async saveReversal(movement) {
            checkInventory(movement.inventoryId);
            reversals.push(movement);
          },
          async updateInventoryState(input) {
            checkInventory(input.inventoryId);
            states.push(input);
          },
          async updateSale(value) {
            checkInventory(value.inventoryId);
            checkSale(value.id);
            if (updatedSale) throw new Error('Duplicate Sale update capture.');
            updatedSale = value;
          },
        },
      };
      return operation(repositories);
    },
  };
  async function persist(): Promise<CommandChanges> {
    if (
      !updatedSale ||
      sale.status !== 'CONFIRMED' ||
      updatedSale.status !== 'VOIDED' ||
      !reversals.length ||
      reversals.length !== items.length ||
      states.length !== items.length ||
      new Set(reversals.map((m) => m.productId)).size !== items.length ||
      new Set(states.map((s) => s.productId)).size !== items.length
    )
      throw new Error('Incomplete Sale void capture.');
    if (
      JSON.stringify({
        ...saleDto(updatedSale),
        status: sale.status,
        updatedAt: sale.updatedAt,
      }) !== JSON.stringify(saleDto(sale))
    )
      throw new Error('Historical Sale fields changed.');
    const originals = await loadOriginalSaleMovements(tx, inventoryId, saleId);
    for (const movement of reversals) {
      const old = stateRows.find((s) => s.productId === movement.productId),
        original = originals.find((m) => m.productId === movement.productId),
        state = states.find((s) => s.productId === movement.productId),
        identity = command.payload.reversalMovements.find(
          (m) => m.productId.toLowerCase() === movement.productId,
        );
      if (
        !old ||
        !original ||
        !state ||
        !identity ||
        movement.id !== identity.movementId.toLowerCase() ||
        movement.type !== 'REVERSAL' ||
        movement.sourceType !== 'INVENTORY_MOVEMENT' ||
        movement.sourceId !== original.id ||
        movement.quantityDelta !== -original.quantityDelta ||
        movement.stockBefore !== original.stockAfter ||
        movement.stockAfter !== original.stockBefore ||
        moneyTransport(movement.unitCostSnapshot) !==
          moneyTransport(original.unitCostSnapshot) ||
        state.state.stock !== movement.stockAfter ||
        moneyTransport(state.state.unitCost) !==
          moneyTransport(original.unitCostSnapshot) ||
        old.stateRevision === 9223372036854775807n
      )
        throw new Error('Invalid Sale void capture/state revision.');
    }
    for (const movement of reversals)
      await tx.insert(inventoryMovements).values({
        ...movementValues(movement),
        reversalOfMovementId: movement.sourceId,
      });
    const stateDtos = [];
    for (const record of states) {
      const old = stateRows.find((s) => s.productId === record.productId),
        movement = reversals.find((m) => m.productId === record.productId);
      if (!old || !movement)
        throw new Error('Missing Sale void state capture.');
      const revision = old.stateRevision + 1n;
      const rows = await tx
        .update(inventoryStates)
        .set({
          stock: BigInt(record.state.stock),
          unitCostUnits:
            record.state.unitCost === null
              ? null
              : BigInt(record.state.unitCost.scaledUnits),
          stateRevision: revision,
          lastMovementId: movement.id,
        })
        .where(
          and(
            eq(inventoryStates.inventoryId, inventoryId),
            eq(inventoryStates.productId, record.productId),
            eq(inventoryStates.stateRevision, old.stateRevision),
          ),
        )
        .returning({ productId: inventoryStates.productId });
      if (rows.length !== 1)
        throw new Error('Missing persisted Sale void state.');
      stateDtos.push(
        stateDto(
          inventoryId,
          record.productId,
          record.state,
          movement.id,
          revision,
        ),
      );
    }
    const rows = await tx
      .update(sales)
      .set({ status: 'VOIDED', updatedAt: BigInt(updatedSale.updatedAt) })
      .where(
        and(
          eq(sales.inventoryId, inventoryId),
          eq(sales.id, saleId),
          eq(sales.status, 'CONFIRMED'),
        ),
      )
      .returning({ id: sales.id });
    if (rows.length !== 1) throw new Error('Missing persisted Sale void.');
    return {
      upserts: {
        sales: [saleDto(updatedSale)],
        inventoryMovements: reversals.map((m) => ({
          ...movementDto(m),
          reversalOfMovementId: m.sourceId,
        })),
        inventoryStates: stateDtos,
        products: [],
        saleItems: [],
        purchases: [],
        stockAdjustments: [],
      },
      tombstones: [],
    };
  }
  return { sale, items, stateRows, stateRecords, transactionManager, persist };
}
