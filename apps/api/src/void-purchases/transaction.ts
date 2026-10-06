import { and, eq, gte, inArray, or } from 'drizzle-orm';
import type {
  TransactionManager,
  TransactionRepositories,
  UpdateInventoryStateInput,
} from '@stock-app/application';
import type { Purchase, InventoryMovement } from '@stock-app/domain';
import type { VoidPurchaseCommand } from '@stock-app/contracts';
import {
  purchases,
  inventoryStates,
  inventoryMovements,
} from '../infrastructure/postgres/schema.js';
import type { CommandTransaction } from '../infrastructure/postgres/command-executor.js';
import type { CommandChanges } from '../infrastructure/postgres/change-sets.js';
import { stateFromRow, moneyTransport } from '../sales/mappers.js';
import { purchaseDto } from '../purchases/mappers.js';
import { movementValues, movementDto, stateDto } from '../products/mappers.js';
import { movementFromRow } from '../void-sales/mappers.js';
import { purchaseFromRow, loadOriginalPurchaseMovements } from './mappers.js';

async function unavailable(): Promise<never> {
  throw new Error('Unsupported Purchase void repository operation.');
}
export async function createBoundVoidPurchaseTransaction(
  tx: CommandTransaction,
  inventoryId: string,
  command: VoidPurchaseCommand,
) {
  const purchaseId = command.payload.purchaseId.toLowerCase();
  const [row] = await tx
    .select()
    .from(purchases)
    .where(
      and(eq(purchases.inventoryId, inventoryId), eq(purchases.id, purchaseId)),
    );
  if (!row) return null;
  const purchase = purchaseFromRow(row),
    stateRows = await tx
      .select()
      .from(inventoryStates)
      .where(eq(inventoryStates.inventoryId, inventoryId)),
    stateRecords = stateRows.map((s) => ({
      inventoryId,
      productId: s.productId,
      state: stateFromRow(s),
    }));
  let reversal: InventoryMovement | undefined,
    state: UpdateInventoryStateInput | undefined,
    updatedPurchase: Purchase | undefined,
    invoked = false;
  function checkInventory(scope: string) {
    if (scope !== inventoryId) throw new Error('Invalid Purchase void scope.');
  }
  function checkPurchase(id: string) {
    if (id !== purchaseId) throw new Error('Invalid Purchase void identity.');
  }
  const transactionManager: TransactionManager = {
    async runInTransaction(operation) {
      if (invoked)
        throw new Error('Purchase void transaction invoked more than once.');
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
        saleVoidRepository: {
          findSale: unavailable,
          listSaleItems: unavailable,
          listOriginalSaleMovements: unavailable,
          listReversals: unavailable,
          listProductMovementsAtOrAfter: unavailable,
          listInventoryStates: unavailable,
          saveReversal: unavailable,
          updateInventoryState: unavailable,
          updateSale: unavailable,
        },
        purchaseVoidRepository: {
          async findPurchase(scope, id) {
            checkInventory(scope);
            checkPurchase(id);
            return purchase;
          },
          async listOriginalPurchaseMovements(scope, id) {
            checkInventory(scope);
            checkPurchase(id);
            return loadOriginalPurchaseMovements(tx, inventoryId, purchaseId);
          },
          async listReversals(scope, originalIds) {
            checkInventory(scope);
            if (!originalIds.length) return [];
            return (
              await tx
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
                )
            ).map(movementFromRow);
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
          async saveReversal(value) {
            checkInventory(value.inventoryId);
            if (reversal)
              throw new Error('Duplicate Purchase reversal capture.');
            reversal = value;
          },
          async updateInventoryState(value) {
            checkInventory(value.inventoryId);
            if (state) throw new Error('Duplicate Purchase state capture.');
            state = value;
          },
          async updatePurchase(value) {
            checkInventory(value.inventoryId);
            checkPurchase(value.id);
            if (updatedPurchase)
              throw new Error('Duplicate Purchase update capture.');
            updatedPurchase = value;
          },
        },
      };
      return operation(repositories);
    },
  };
  async function persist(): Promise<CommandChanges> {
    const original = (
        await loadOriginalPurchaseMovements(tx, inventoryId, purchaseId)
      )[0],
      old = stateRows.find((s) => s.productId === purchase.productId);
    if (
      !reversal ||
      !state ||
      !updatedPurchase ||
      !original ||
      !old ||
      purchase.status !== 'CONFIRMED' ||
      updatedPurchase.status !== 'VOIDED' ||
      reversal.id !== command.payload.reversalMovementId.toLowerCase() ||
      reversal.productId !== purchase.productId ||
      state.productId !== purchase.productId ||
      reversal.type !== 'REVERSAL' ||
      reversal.sourceType !== 'INVENTORY_MOVEMENT' ||
      reversal.sourceId !== original.id ||
      reversal.quantityDelta !== -purchase.quantity ||
      reversal.stockBefore !== purchase.stockAfter ||
      reversal.stockAfter !== purchase.stockBefore ||
      moneyTransport(reversal.unitCostSnapshot) !==
        moneyTransport(purchase.unitCost) ||
      state.state.stock !== purchase.stockBefore ||
      moneyTransport(state.state.unitCost) !==
        moneyTransport(purchase.averageCostBefore) ||
      old.stateRevision === 9223372036854775807n
    )
      throw new Error('Invalid Purchase void capture/state revision.');
    if (
      JSON.stringify({
        ...purchaseDto(updatedPurchase),
        status: purchase.status,
        updatedAt: purchase.updatedAt,
      }) !== JSON.stringify(purchaseDto(purchase))
    )
      throw new Error('Historical Purchase fields changed.');
    await tx.insert(inventoryMovements).values({
      ...movementValues(reversal),
      reversalOfMovementId: original.id,
    });
    // REVERSAL records the incoming cost; State restores the prior average, including null/known zero.
    const revision = old.stateRevision + 1n;
    const states = await tx
      .update(inventoryStates)
      .set({
        stock: BigInt(state.state.stock),
        unitCostUnits:
          state.state.unitCost === null
            ? null
            : BigInt(state.state.unitCost.scaledUnits),
        stateRevision: revision,
        lastMovementId: reversal.id,
      })
      .where(
        and(
          eq(inventoryStates.inventoryId, inventoryId),
          eq(inventoryStates.productId, purchase.productId),
          eq(inventoryStates.stateRevision, old.stateRevision),
        ),
      )
      .returning({ id: inventoryStates.productId });
    if (states.length !== 1)
      throw new Error('Missing persisted Purchase void state.');
    const rows = await tx
      .update(purchases)
      .set({ status: 'VOIDED', updatedAt: BigInt(updatedPurchase.updatedAt) })
      .where(
        and(
          eq(purchases.inventoryId, inventoryId),
          eq(purchases.id, purchaseId),
          eq(purchases.status, 'CONFIRMED'),
        ),
      )
      .returning({ id: purchases.id });
    if (rows.length !== 1) throw new Error('Missing persisted Purchase void.');
    return {
      upserts: {
        purchases: [purchaseDto(updatedPurchase)],
        inventoryMovements: [
          { ...movementDto(reversal), reversalOfMovementId: original.id },
        ],
        inventoryStates: [
          stateDto(
            inventoryId,
            purchase.productId,
            state.state,
            reversal.id,
            revision,
          ),
        ],
        products: [],
        sales: [],
        saleItems: [],
        stockAdjustments: [],
      },
      tombstones: [],
    };
  }
  return { purchase, stateRows, stateRecords, transactionManager, persist };
}
