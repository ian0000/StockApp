import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  domainTimestamps,
  exactInteger,
  safeRange,
  timeChecks,
} from './columns.js';
import { user } from './auth-schema.js';
export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'no action' }),
    status: text('status').notNull().default('ACTIVE'),
    cloudAccessEnabled: boolean('cloud_access_enabled')
      .notNull()
      .default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'businesses_owner_nonempty',
      sql`length(btrim(${t.ownerUserId})) > 0`,
    ),
    check('businesses_status_valid', sql`${t.status} IN ('ACTIVE','DELETING')`),
    check('businesses_updated_at_valid', sql`${t.updatedAt} >= ${t.createdAt}`),
  ],
);

export const inventories = pgTable(
  'inventories',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .unique()
      .references(() => businesses.id),
    name: text('name').notNull(),
    currency: text('currency').notNull(),
    reportingTimeZone: text('reporting_time_zone').notNull(),
    generation: uuid('generation').notNull().defaultRandom(),
    revision: exactInteger('revision')
      .notNull()
      .default(sql`0`),
    ...domainTimestamps(),
  },
  (t) => [
    check('inventories_name_nonempty', sql`length(btrim(${t.name})) > 0`),
    check('inventories_currency_shape', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      'inventories_timezone_nonempty',
      sql`length(btrim(${t.reportingTimeZone})) > 0`,
    ),
    unique('inventories_business_id_id_unique').on(t.businessId, t.id),
    check('inventories_revision_nonnegative', sql`${t.revision} >= 0`),
    ...timeChecks('inventories', t),
  ],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey(),
    inventoryId: uuid('inventory_id')
      .notNull()
      .references(() => inventories.id),
    name: text('name').notNull(),
    variant: text('variant'),
    barcode: text('barcode'),
    regularSalePriceUnits: exactInteger('regular_sale_price_units').notNull(),
    minimumStock: exactInteger('minimum_stock'),
    isArchived: boolean('is_archived').notNull().default(false),
    metadataRevision: exactInteger('metadata_revision')
      .notNull()
      .default(sql`0`),
    ...domainTimestamps(),
  },
  (t) => [
    unique('products_inventory_id_id_unique').on(t.inventoryId, t.id),
    uniqueIndex('products_active_barcode_unique')
      .on(t.inventoryId, t.barcode)
      .where(sql`${t.barcode} IS NOT NULL AND ${t.isArchived} = false`),
    index('products_inventory_created_idx').on(
      t.inventoryId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    check('products_name_nonempty', sql`length(btrim(${t.name})) > 0`),
    safeRange(
      'products_regular_sale_price_safe',
      t.regularSalePriceUnits,
      true,
    ),
    safeRange('products_minimum_stock_safe', t.minimumStock, true),
    check(
      'products_metadata_revision_nonnegative',
      sql`${t.metadataRevision} >= 0`,
    ),
    ...timeChecks('products', t),
  ],
);
