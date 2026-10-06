import { and, eq } from 'drizzle-orm';
import type {
  TransactionManager,
  TransactionRepositories,
  SaveInventoryStateInput,
} from '@stock-app/application';
import type { StockAdjustment, InventoryMovement } from '@stock-app/domain';
import {
  products,
  inventoryStates,
  stockAdjustments,
  inventoryMovements,
} from '../infrastructure/postgres/schema.js';
import type { CommandTransaction } from '../infrastructure/postgres/command-executor.js';
import type { CommandChanges } from '../infrastructure/postgres/change-sets.js';
import {
  productFromRow,
  movementValues,
  movementDto,
  stateDto,
} from '../products/mappers.js';
import { stateFromRow } from '../sales/mappers.js';
import { adjustmentDto, adjustmentValues } from './mappers.js';
import type { AdjustmentCommand } from './execute.js';

async function unavailable(): Promise<never> {
  throw new Error('Unsupported adjustment transaction repository operation.');
}
const voidRepository = {
  listReversals: unavailable,
  listProductMovementsAtOrAfter: unavailable,
  listInventoryStates: unavailable,
  saveReversal: unavailable,
  updateInventoryState: unavailable,
};

export async function createBoundAdjustmentTransaction(
  tx: CommandTransaction,
  inventoryId: string,
  command: AdjustmentCommand,
) {
  const rows = await tx
    .select()
    .from(products)
    .where(eq(products.inventoryId, inventoryId));
  const stateRows = await tx
    .select()
    .from(inventoryStates)
    .where(eq(inventoryStates.inventoryId, inventoryId));
  const domainProducts = rows.map(productFromRow),
    stateRecords = stateRows.map((row) => ({
      inventoryId,
      productId: row.productId,
      state: stateFromRow(row),
    }));
  const productId = command.payload.productId.toLowerCase(),
    oldState = stateRows.find((row) => row.productId === productId);
  let capturedAdjustment: StockAdjustment | undefined,
    capturedMovement: InventoryMovement | undefined,
    capturedState: SaveInventoryStateInput | undefined,
    invoked = false;
  function checkScope(scope: string) {
    if (scope !== inventoryId)
      throw new Error('Invalid adjustment repository scope.');
  }
  const transactionManager: TransactionManager = {
    async runInTransaction(operation) {
      if (invoked)
        throw new Error('Adjustment transaction invoked more than once.');
      invoked = true;
      const repositories: TransactionRepositories = {
        productRepository: {
          save: unavailable,
          async listByInventory(scope) {
            checkScope(scope);
            return domainProducts;
          },
        },
        inventoryStateRepository: {
          save: unavailable,
          async listByInventory(scope) {
            checkScope(scope);
            return stateRecords;
          },
          async update(record) {
            checkScope(record.inventoryId);
            if (capturedState)
              throw new Error('Duplicate adjustment state capture.');
            capturedState = record;
          },
        },
        stockAdjustmentRepository: {
          async save(adjustment) {
            checkScope(adjustment.inventoryId);
            if (capturedAdjustment)
              throw new Error('Duplicate adjustment capture.');
            capturedAdjustment = adjustment;
          },
        },
        inventoryMovementRepository: {
          async save(movement) {
            checkScope(movement.inventoryId);
            if (capturedMovement)
              throw new Error('Duplicate adjustment movement capture.');
            capturedMovement = movement;
          },
        },
        saleRepository: { save: unavailable },
        saleItemRepository: { save: unavailable },
        purchaseRepository: { save: unavailable },
        saleVoidRepository: {
          ...voidRepository,
          findSale: unavailable,
          listSaleItems: unavailable,
          listOriginalSaleMovements: unavailable,
          updateSale: unavailable,
        },
        purchaseVoidRepository: {
          ...voidRepository,
          findPurchase: unavailable,
          listOriginalPurchaseMovements: unavailable,
          updatePurchase: unavailable,
        },
      };
      // Application's exact writes are staged on this bound tx, after all preconditions pass.
      return operation(repositories);
    },
  };
  async function persist(): Promise<CommandChanges> {
    const adjustment = capturedAdjustment,
      movement = capturedMovement,
      record = capturedState;
    if (
      !adjustment ||
      !movement ||
      !record ||
      !oldState ||
      adjustment.unitCost === null ||
      record.state.unitCost === null ||
      adjustment.id !== command.payload.stockAdjustmentId.toLowerCase() ||
      adjustment.productId !== productId ||
      movement.id !== command.payload.movementId.toLowerCase() ||
      movement.productId !== productId ||
      record.productId !== productId ||
      movement.type !==
        (adjustment.difference > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT') ||
      movement.sourceType !== 'STOCK_ADJUSTMENT' ||
      movement.sourceId !== adjustment.id ||
      movement.quantityDelta !== adjustment.difference ||
      movement.stockBefore !== adjustment.stockBefore ||
      movement.stockAfter !== adjustment.actualStock ||
      !movement.unitCostSnapshot?.equals(adjustment.unitCost) ||
      record.state.stock !== adjustment.actualStock
    )
      throw new Error('Invalid adjustment capture.');
    if (oldState.stateRevision === 9223372036854775807n)
      throw new Error('State revision overflow.');
    const revision = oldState.stateRevision + 1n;
    await tx.insert(stockAdjustments).values(adjustmentValues(adjustment));
    await tx.insert(inventoryMovements).values(movementValues(movement));
    const updated = await tx
      .update(inventoryStates)
      .set({
        stock: BigInt(record.state.stock),
        unitCostUnits: BigInt(record.state.unitCost.scaledUnits),
        stateRevision: revision,
        lastMovementId: movement.id,
      })
      .where(
        and(
          eq(inventoryStates.inventoryId, inventoryId),
          eq(inventoryStates.productId, productId),
          eq(inventoryStates.stateRevision, oldState.stateRevision),
        ),
      )
      .returning({ id: inventoryStates.productId });
    if (updated.length !== 1)
      throw new Error('Missing persisted adjustment state.');
    return {
      upserts: {
        stockAdjustments: [adjustmentDto(adjustment)],
        inventoryMovements: [movementDto(movement)],
        inventoryStates: [
          stateDto(inventoryId, productId, record.state, movement.id, revision),
        ],
        products: [],
        purchases: [],
        sales: [],
        saleItems: [],
      },
      tombstones: [],
    };
  }
  return {
    transactionManager,
    domainProducts,
    stateRecords,
    oldState,
    persist,
  };
}
