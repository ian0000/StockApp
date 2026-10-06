import { and, eq, ne } from 'drizzle-orm';
import type {
  TransactionManager,
  TransactionRepositories,
  ProductManagementRepository,
  SaveInventoryStateInput,
} from '@stock-app/application';
import type { InventoryMovement, Product } from '@stock-app/domain';
import type { CommandTransaction } from '../infrastructure/postgres/command-executor.js';
import {
  products,
  inventoryStates,
  inventoryMovements,
} from '../infrastructure/postgres/schema.js';
import { movementValues, productFromRow, productValues } from './mappers.js';

export class ProductRuleError extends Error {}
class ProductPersistenceError extends Error {}

async function persist<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProductRuleError) throw error;
    // Persistence/runtime failures must never become a terminal Domain validation receipt.
    throw new ProductPersistenceError('Product persistence failed.', {
      cause: error,
    });
  }
}

export async function findProduct(
  tx: CommandTransaction,
  inventoryId: string,
  productId: string,
) {
  const [row] = await tx
    .select()
    .from(products)
    .where(
      and(eq(products.inventoryId, inventoryId), eq(products.id, productId)),
    );
  return row ?? null;
}

async function checkBarcode(tx: CommandTransaction, product: Product) {
  if (product.barcode === null || product.isArchived) return;
  const [other] = await tx
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.inventoryId, product.inventoryId),
        eq(products.barcode, product.barcode),
        eq(products.isArchived, false),
        ne(products.id, product.id),
      ),
    );
  if (other) throw new ProductRuleError();
}

export function productManagementRepository(
  tx: CommandTransaction,
  inventoryId: string,
  revision: bigint,
): ProductManagementRepository {
  return {
    async findById(scope, id) {
      if (scope !== inventoryId) throw new Error('Invalid repository scope.');
      return persist(async () => {
        const row = await findProduct(tx, scope, id);
        return row === null ? null : productFromRow(row);
      });
    },
    async update(product) {
      if (product.inventoryId !== inventoryId)
        throw new Error('Invalid repository scope.');
      await persist(async () => {
        await checkBarcode(tx, product);
        await tx
          .update(products)
          .set({ ...productValues(product), metadataRevision: revision })
          .where(
            and(
              eq(products.inventoryId, inventoryId),
              eq(products.id, product.id),
            ),
          );
      });
    },
  };
}

// Application's ports include future financial operations. This product-only adapter fails closed.
async function unavailable(): Promise<never> {
  throw new Error('Unsupported product transaction repository operation.');
}
const voidRepository = {
  listReversals: unavailable,
  listProductMovementsAtOrAfter: unavailable,
  listInventoryStates: unavailable,
  saveReversal: unavailable,
  updateInventoryState: unavailable,
};

export function boundProductTransaction(
  tx: CommandTransaction,
  inventoryId: string,
): TransactionManager {
  return {
    async runInTransaction(operation) {
      let pendingState: SaveInventoryStateInput | undefined;
      let pendingMovement: InventoryMovement | undefined;
      const repositories: TransactionRepositories = {
        productRepository: {
          listByInventory: unavailable,
          async save(product) {
            if (product.inventoryId !== inventoryId)
              throw new Error('Invalid repository scope.');
            await persist(async () => {
              await checkBarcode(tx, product);
              await tx
                .insert(products)
                .values({ ...productValues(product), metadataRevision: 0n });
            });
          },
        },
        inventoryStateRepository: {
          listByInventory: unavailable,
          update: unavailable,
          async save(state) {
            if (state.inventoryId !== inventoryId || pendingState)
              throw new Error('Invalid initial state.');
            pendingState = state;
          },
        },
        inventoryMovementRepository: {
          async save(movement) {
            if (movement.inventoryId !== inventoryId || pendingMovement)
              throw new Error('Invalid initial movement.');
            await persist(async () =>
              tx.insert(inventoryMovements).values(movementValues(movement)),
            );
            pendingMovement = movement;
          },
        },
        purchaseRepository: { save: unavailable },
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
      const result = await operation(repositories);
      // Defer only the initial state: Product -> Movement -> State satisfies the immediate FK.
      // No BEGIN, nested transaction, constraint disabling or changes to Application's ordering.
      if (
        !pendingState ||
        (pendingMovement &&
          pendingMovement.productId !== pendingState.productId)
      )
        throw new Error('Incomplete initial inventory.');
      const initialState = pendingState;
      await persist(async () =>
        tx.insert(inventoryStates).values({
          inventoryId,
          productId: initialState.productId,
          stock: BigInt(initialState.state.stock),
          unitCostUnits:
            initialState.state.unitCost === null
              ? null
              : BigInt(initialState.state.unitCost.scaledUnits),
          stateRevision: 0n,
          lastMovementId: pendingMovement?.id ?? null,
        }),
      );
      return result;
    },
  };
}
