import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  pgTable,
  primaryKey,
  uuid,
} from 'drizzle-orm/pg-core';
import { exactInteger, safeRange } from './columns.js';
import { products } from './catalog.js';
import { inventoryMovements } from './ledger.js';
export const inventoryStates = pgTable(
  'inventory_states',
  {
    inventoryId: uuid('inventory_id').notNull(),
    productId: uuid('product_id').notNull(),
    stock: exactInteger('stock').notNull(),
    unitCostUnits: exactInteger('unit_cost_units'),
    stateRevision: exactInteger('state_revision')
      .notNull()
      .default(sql`0`),
    lastMovementId: uuid('last_movement_id'),
  },
  (t) => [
    primaryKey({ columns: [t.inventoryId, t.productId] }),
    foreignKey({
      name: 'inventory_states_product_fk',
      columns: [t.inventoryId, t.productId],
      foreignColumns: [products.inventoryId, products.id],
    }),
    foreignKey({
      name: 'inventory_states_last_movement_fk',
      columns: [t.inventoryId, t.productId, t.lastMovementId],
      foreignColumns: [
        inventoryMovements.inventoryId,
        inventoryMovements.productId,
        inventoryMovements.id,
      ],
    }),
    check(
      'inventory_states_revision_nonnegative',
      sql`${t.stateRevision} >= 0`,
    ),
    safeRange('inventory_states_stock_safe', t.stock),
    safeRange('inventory_states_cost_safe', t.unitCostUnits, true),
    check(
      'inventory_states_positive_stock_cost_required',
      sql`${t.stock} <= 0 OR ${t.unitCostUnits} IS NOT NULL`,
    ),
  ],
);
