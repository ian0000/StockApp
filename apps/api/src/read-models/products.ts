import { and, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import {
  calculateMargin,
  calculateMarkup,
  isProductLowStock,
  type Percentage,
} from '@stock-app/domain';
import {
  encodePercentage,
  type ProductReadDto,
  type ProductPage,
} from '@stock-app/contracts';
import {
  products,
  inventoryStates,
} from '../infrastructure/postgres/schema.js';
import { productFromRow, productDto, stateDto } from '../products/mappers.js';
import { stateFromRow } from '../sales/mappers.js';
import type { OwnershipDatabase } from '../ownership/context.js';
import type { CommandTransaction } from '../infrastructure/postgres/command-executor.js';
import type { ReadKey, ReadScope, createReadCursor } from './cursor.js';

export type ReadDatabase = OwnershipDatabase | CommandTransaction;
export function normalizeSearch(value = '') {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
function available(calculation: () => Percentage | null) {
  try {
    const result = calculation();
    return result === null ? null : encodePercentage(result.scaledUnits);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
function productRead(row: {
  product: typeof products.$inferSelect;
  state: typeof inventoryStates.$inferSelect | null;
}): ProductReadDto {
  if (
    !row.state ||
    row.state.inventoryId !== row.product.inventoryId ||
    row.state.productId !== row.product.id
  )
    throw new Error('Missing scoped Product state.');
  const product = productFromRow(row.product),
    state = stateFromRow(row.state),
    input =
      state.unitCost === null
        ? null
        : {
            salePrice: product.regularSalePrice,
            estimatedUnitCost: state.unitCost,
          };
  return {
    product: productDto(product, row.product.metadataRevision),
    state: stateDto(
      product.inventoryId,
      product.id,
      state,
      row.state.lastMovementId,
      row.state.stateRevision,
    ),
    isLowStock: isProductLowStock(product, state),
    margin: input === null ? null : available(() => calculateMargin(input)),
    markup: input === null ? null : available(() => calculateMarkup(input)),
  };
}
function after(key: ReadKey | undefined) {
  return key === undefined
    ? undefined
    : or(
        lt(products.createdAt, BigInt(key.createdAt)),
        and(
          eq(products.createdAt, BigInt(key.createdAt)),
          lt(products.id, key.id),
        ),
      );
}
export async function readProduct(
  db: ReadDatabase,
  inventoryId: string,
  identity: { id: string } | { barcode: string },
): Promise<ProductReadDto | null> {
  const [row] = await db
    .select({ product: products, state: inventoryStates })
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
        eq(products.isArchived, false),
        'id' in identity
          ? eq(products.id, identity.id.toLowerCase())
          : eq(products.barcode, identity.barcode),
      ),
    )
    .limit(1);
  return row ? productRead(row) : null;
}
export async function readProductPage(
  db: ReadDatabase,
  scope: ReadScope,
  limit: number,
  cursor: string | undefined,
  codec: ReturnType<typeof createReadCursor>,
  lowStock = false,
): Promise<ProductPage> {
  let position = codec.decode(cursor, scope);
  const items: ProductReadDto[] = [],
    search = normalizeSearch(scope.search);
  const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
  const searchFilter: SQL | undefined = search
    ? sql`(lower(regexp_replace(trim(${products.name}), '[[:space:]]+', ' ', 'g')) LIKE ${pattern} OR lower(regexp_replace(trim(coalesce(${products.variant}, '')), '[[:space:]]+', ' ', 'g')) LIKE ${pattern} OR ${products.barcode} = ${scope.search})`
    : undefined;
  while (items.length <= limit) {
    const rows = await db
      .select({ product: products, state: inventoryStates })
      .from(products)
      .leftJoin(
        inventoryStates,
        and(
          eq(inventoryStates.inventoryId, scope.inventoryId),
          eq(inventoryStates.productId, products.id),
        ),
      )
      .where(
        and(
          eq(products.inventoryId, scope.inventoryId),
          eq(products.isArchived, false),
          searchFilter,
          after(position),
        ),
      )
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(lowStock ? 100 : limit + 1);
    if (!rows.length) break;
    for (const row of rows) {
      const value = productRead(row);
      if (!lowStock || value.isLowStock) items.push(value);
      if (items.length > limit) break;
    }
    const last = rows.at(-1)!;
    position = {
      createdAt: Number(last.product.createdAt),
      id: last.product.id,
    };
    if (!lowStock || rows.length < 100) break;
  }
  const visible = items.slice(0, limit),
    last = visible.at(-1),
    more = items.length > limit;
  return {
    items: visible,
    nextCursor:
      more && last
        ? codec.encode(scope, {
            createdAt: last.product.createdAt,
            id: last.product.id,
          })
        : null,
  };
}
