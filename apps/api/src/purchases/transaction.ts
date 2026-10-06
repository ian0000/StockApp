import { and, eq } from 'drizzle-orm';
import type {
  TransactionManager,
  TransactionRepositories,
  SaveInventoryStateInput,
} from '@stock-app/application';
import type { Purchase, InventoryMovement } from '@stock-app/domain';
import {
  products,
  inventoryStates,
  purchases,
  inventoryMovements,
} from '../infrastructure/postgres/schema.js';
import type { CommandTransaction } from '../infrastructure/postgres/command-executor.js';
import type { CommandChanges } from '../infrastructure/postgres/change-sets.js';
import {
  productFromRow,
  productDto,
  movementValues,
  movementDto,
  stateDto,
} from '../products/mappers.js';
import { stateFromRow } from '../sales/mappers.js';
import { purchaseDto, purchaseValues } from './mappers.js';
import type { PurchaseCommand } from './execute.js';

async function unavailable(): Promise<never> {
  throw new Error('Unsupported purchase transaction repository operation.');
}
const voidRepository = {
  listReversals: unavailable,
  listProductMovementsAtOrAfter: unavailable,
  listInventoryStates: unavailable,
  saveReversal: unavailable,
  updateInventoryState: unavailable,
};

export async function createBoundPurchaseTransaction(
  tx: CommandTransaction,
  inventoryId: string,
  command: PurchaseCommand,
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
    oldState = stateRows.find((row) => row.productId === productId),
    productRow = rows.find((row) => row.id === productId);
  let capturedPurchase: Purchase | undefined,
    capturedMovement: InventoryMovement | undefined,
    capturedState: SaveInventoryStateInput | undefined,
    invoked = false;
  function checkScope(scope: string) {
    if (scope !== inventoryId)
      throw new Error('Invalid purchase repository scope.');
  }
  const transactionManager: TransactionManager = {
    async runInTransaction(operation) {
      if (invoked)
        throw new Error('Purchase transaction invoked more than once.');
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
              throw new Error('Duplicate purchase state capture.');
            capturedState = record;
          },
        },
        purchaseRepository: {
          async save(purchase) {
            checkScope(purchase.inventoryId);
            if (capturedPurchase)
              throw new Error('Duplicate purchase capture.');
            capturedPurchase = purchase;
          },
        },
        inventoryMovementRepository: {
          async save(movement) {
            checkScope(movement.inventoryId);
            if (capturedMovement)
              throw new Error('Duplicate purchase movement capture.');
            capturedMovement = movement;
          },
        },
        saleRepository: { save: unavailable },
        saleItemRepository: { save: unavailable },
        stockAdjustmentRepository: { save: unavailable },
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
      // Application's writes are staged on this bound tx; preconditions have already passed.
      return operation(repositories);
    },
  };
  async function persist(): Promise<CommandChanges> {
    const purchase = capturedPurchase,
      movement = capturedMovement,
      record = capturedState;
    if (
      !purchase ||
      !movement ||
      !record ||
      !oldState ||
      !productRow ||
      purchase.id !== command.payload.purchaseId.toLowerCase() ||
      purchase.productId !== productId ||
      movement.id !== command.payload.movementId.toLowerCase() ||
      movement.productId !== productId ||
      record.productId !== productId ||
      movement.type !== 'PURCHASE' ||
      movement.sourceType !== 'PURCHASE' ||
      movement.sourceId !== purchase.id ||
      movement.quantityDelta !== purchase.quantity ||
      movement.stockBefore !== purchase.stockBefore ||
      movement.stockAfter !== purchase.stockAfter ||
      !movement.unitCostSnapshot?.equals(purchase.unitCost) ||
      record.state.stock !== purchase.stockAfter ||
      !record.state.unitCost?.equals(purchase.averageCostAfter)
    )
      throw new Error('Invalid purchase capture.');
    if (oldState.stateRevision === 9223372036854775807n)
      throw new Error('State revision overflow.');
    const revision = oldState.stateRevision + 1n;
    const product = domainProducts.find((p) => p.id === productId);
    if (!product) throw new Error('Missing purchase Product snapshot.');
    // Snapshot supports durable response reconstruction; it is not a Product DB mutation.
    const snapshot = productDto(product, productRow.metadataRevision);
    await tx.insert(purchases).values(purchaseValues(purchase));
    await tx.insert(inventoryMovements).values(movementValues(movement));
    const updated = await tx
      .update(inventoryStates)
      .set({
        stock: BigInt(record.state.stock),
        unitCostUnits: BigInt(purchase.averageCostAfter.scaledUnits),
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
      throw new Error('Missing persisted purchase state.');
    return {
      upserts: {
        products: [snapshot],
        purchases: [purchaseDto(purchase)],
        inventoryMovements: [movementDto(movement)],
        inventoryStates: [
          stateDto(inventoryId, productId, record.state, movement.id, revision),
        ],
        sales: [],
        saleItems: [],
        stockAdjustments: [],
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
