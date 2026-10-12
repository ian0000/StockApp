import { and, eq } from 'drizzle-orm';
import type { InventoryStateDto } from '@stock-app/contracts';
import {
  products,
  inventoryStates,
} from '../infrastructure/postgres/schema.js';
import { stateDto } from '../products/mappers.js';
import { stateFromRow } from '../sales/mappers.js';
import type { ReadDatabase } from './products.js';

// Historical voids need current evidence even when the Product is archived.
export async function readProductState(
  db: ReadDatabase,
  inventoryId: string,
  productId: string,
): Promise<InventoryStateDto | null> {
  const [row] = await db
    .select({ productId: products.id, state: inventoryStates })
    .from(products)
    .leftJoin(
      inventoryStates,
      and(
        eq(inventoryStates.inventoryId, inventoryId),
        eq(inventoryStates.productId, products.id),
      ),
    )
    .where(
      and(
        eq(products.inventoryId, inventoryId),
        eq(products.id, productId.toLowerCase()),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (!row.state) throw new Error('Missing scoped Product state.');
  return stateDto(
    inventoryId,
    row.productId,
    stateFromRow(row.state),
    row.state.lastMovementId,
    row.state.stateRevision,
  );
}
