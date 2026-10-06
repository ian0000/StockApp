import { and, eq } from 'drizzle-orm';
import type {
  TransactionManager,
  TransactionRepositories,
  InventoryStateRecord,
  SaveInventoryStateInput,
} from '@stock-app/application';
import type { Sale, SaleItem, InventoryMovement } from '@stock-app/domain';
import {
  products,
  inventoryStates,
  sales,
  saleItems,
  inventoryMovements,
} from '../infrastructure/postgres/schema.js';
import type { CommandTransaction } from '../infrastructure/postgres/command-executor.js';
import {
  productFromRow,
  movementValues,
  movementDto,
  stateDto,
} from '../products/mappers.js';
import {
  stateFromRow,
  saleValues,
  saleItemValues,
  saleDto,
  saleItemDto,
} from './mappers.js';
import type { SaleCommand } from './execute.js';
import type { CommandChanges } from '../infrastructure/postgres/change-sets.js';

async function unavailable(): Promise<never> {
  throw new Error('Unsupported sale transaction repository operation.');
}
const voidRepository = {
  listReversals: unavailable,
  listProductMovementsAtOrAfter: unavailable,
  listInventoryStates: unavailable,
  saveReversal: unavailable,
  updateInventoryState: unavailable,
};

export async function createBoundSaleTransaction(
  tx: CommandTransaction,
  inventoryId: string,
  command: SaleCommand,
) {
  const rows = await tx
    .select()
    .from(products)
    .where(eq(products.inventoryId, inventoryId));
  const stateRows = await tx
    .select()
    .from(inventoryStates)
    .where(eq(inventoryStates.inventoryId, inventoryId));
  const domainProducts = rows.map(productFromRow);
  const stateRecords: InventoryStateRecord[] = stateRows.map((row) => ({
    inventoryId,
    productId: row.productId,
    state: stateFromRow(row),
  }));
  const oldStates = new Map(stateRows.map((row) => [row.productId, row]));
  const capturedItems: SaleItem[] = [],
    capturedMovements: InventoryMovement[] = [],
    capturedStates: SaveInventoryStateInput[] = [];
  let capturedSale: Sale | undefined,
    invoked = false;
  const checkScope = (scope: string) => {
    if (scope !== inventoryId)
      throw new Error('Invalid sale repository scope.');
  };
  const transactionManager: TransactionManager = {
    async runInTransaction(operation) {
      if (invoked) throw new Error('Sale transaction invoked more than once.');
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
          async update(state) {
            checkScope(state.inventoryId);
            capturedStates.push(state);
          },
        },
        saleRepository: {
          async save(sale) {
            checkScope(sale.inventoryId);
            if (capturedSale) throw new Error('Duplicate staged sale.');
            capturedSale = sale;
          },
        },
        saleItemRepository: {
          async save(item) {
            capturedItems.push(item);
          },
        },
        inventoryMovementRepository: {
          async save(movement) {
            checkScope(movement.inventoryId);
            capturedMovements.push(movement);
          },
        },
        purchaseRepository: { save: unavailable },
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
      // Stage Application's exact writes; all evidence is validated before any commercial SQL.
      return operation(repositories);
    },
  };
  async function persist(): Promise<CommandChanges> {
    const sale = capturedSale;
    if (
      !sale ||
      sale.id !== command.payload.saleId.toLowerCase() ||
      capturedItems.length !== command.payload.items.length ||
      capturedMovements.length !== capturedItems.length ||
      capturedStates.length !== capturedItems.length
    )
      throw new Error('Incomplete sale capture.');
    const movementsByProduct = new Map(
      capturedMovements.map((m) => [m.productId, m]),
    );
    if (
      movementsByProduct.size !== capturedStates.length ||
      new Set(capturedStates.map((s) => s.productId)).size !==
        capturedStates.length
    )
      throw new Error('Invalid sale movement coverage.');
    const resultingStates = capturedStates.map((record, index) => {
      const old = oldStates.get(record.productId),
        movement = movementsByProduct.get(record.productId),
        line = command.payload.items[index];
      if (
        !old ||
        !movement ||
        movement.productId !== line.productId.toLowerCase() ||
        movement.id !== line.movementId.toLowerCase() ||
        capturedItems[index].id !== line.saleItemId.toLowerCase() ||
        capturedItems[index].productId !== record.productId ||
        capturedItems[index].saleId !== sale.id ||
        movement.sourceId !== sale.id ||
        record.state.stock !== movement.stockAfter
      )
        throw new Error('Invalid sale state capture.');
      if (old.stateRevision === 9223372036854775807n)
        throw new Error('State revision overflow.');
      return { record, movement, revision: old.stateRevision + 1n };
    });
    // Preserve Application's Sale -> Items -> Movements -> States ordering on this same tx.
    await tx.insert(sales).values(saleValues(sale));
    for (const item of capturedItems)
      await tx.insert(saleItems).values(saleItemValues(item, inventoryId));
    for (const movement of capturedMovements)
      await tx.insert(inventoryMovements).values(movementValues(movement));
    for (const { record, movement, revision } of resultingStates) {
      const updated = await tx
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
          ),
        )
        .returning({ id: inventoryStates.productId });
      if (updated.length !== 1)
        throw new Error('Missing persisted sale state.');
    }
    return {
      upserts: {
        sales: [saleDto(sale)],
        saleItems: capturedItems.map((item) => saleItemDto(item, inventoryId)),
        inventoryMovements: capturedMovements.map(movementDto),
        inventoryStates: resultingStates.map(({ record, movement, revision }) =>
          stateDto(
            inventoryId,
            record.productId,
            record.state,
            movement.id,
            revision,
          ),
        ),
        products: [],
        purchases: [],
        stockAdjustments: [],
      },
      tombstones: [],
    };
  }
  return { transactionManager, domainProducts, stateRecords, persist };
}
