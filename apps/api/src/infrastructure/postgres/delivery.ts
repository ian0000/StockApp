import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { exactInteger } from './columns.js';
import { businesses, inventories } from './catalog.js';

export const syncDevices = pgTable(
  'sync_devices',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    protocolVersion: integer('protocol_version').notNull(),
    domainVersion: text('domain_version').notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('sync_devices_business_id_id_unique').on(t.businessId, t.id),
    check('sync_devices_protocol_positive', sql`${t.protocolVersion} > 0`),
    check(
      'sync_devices_domain_version_nonempty',
      sql`length(btrim(${t.domainVersion})) > 0`,
    ),
  ],
);

export const operationReceipts = pgTable(
  'operation_receipts',
  {
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    operationId: uuid('operation_id').notNull(),
    payloadHash: text('payload_hash').notNull(),
    kind: text('kind').notNull(),
    resultCode: text('result_code').notNull(),
    resultReferences: jsonb('result_references').notNull().default({}),
    committedRevision: exactInteger('committed_revision'),
    deviceId: uuid('device_id'),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.operationId] }),
    foreignKey({
      name: 'operation_receipts_device_fk',
      columns: [t.businessId, t.deviceId],
      foreignColumns: [syncDevices.businessId, syncDevices.id],
    }),
    check(
      'operation_receipts_hash_shape',
      sql`${t.payloadHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'operation_receipts_kind_nonempty',
      sql`length(btrim(${t.kind})) > 0`,
    ),
    check(
      'operation_receipts_result_nonempty',
      sql`length(btrim(${t.resultCode})) > 0`,
    ),
    check(
      'operation_receipts_references_object',
      sql`jsonb_typeof(${t.resultReferences}) = 'object'`,
    ),
    check(
      'operation_receipts_revision_nonnegative',
      sql`${t.committedRevision} >= 0`,
    ),
  ],
);

export const inventoryChangeSets = pgTable(
  'inventory_change_sets',
  {
    inventoryId: uuid('inventory_id')
      .notNull()
      .references(() => inventories.id),
    revision: exactInteger('revision').notNull(),
    // One object per committed command; entity payload schemas are frozen in CLOUD-06.
    changes: jsonb('changes').notNull(),
    serverRecordedAt: timestamp('server_recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.inventoryId, t.revision] }),
    check(
      'inventory_change_sets_revision_nonnegative',
      sql`${t.revision} >= 0`,
    ),
    check(
      'inventory_change_sets_changes_object',
      sql`jsonb_typeof(${t.changes}) = 'object'`,
    ),
  ],
);

export const importSessions = pgTable(
  'import_sessions',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    hash: text('hash').notNull(),
    inventoryId: uuid('inventory_id').notNull(),
    expectedEmptyGeneration: uuid('expected_empty_generation').notNull(),
    bytes: exactInteger('bytes').notNull(),
    chunks: integer('chunks').notNull(),
    status: text('status').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consentRecordedAt: timestamp('consent_recorded_at', {
      withTimezone: true,
    }).notNull(),
  },
  (t) => [
    // Inventory may only be a reserved ID during onboarding, so there is no Inventory FK yet.
    unique('import_sessions_business_hash_unique').on(t.businessId, t.hash),
    index('import_sessions_business_status_idx').on(t.businessId, t.status),
    check('import_sessions_hash_shape', sql`${t.hash} ~ '^[0-9a-f]{64}$'`),
    check(
      'import_sessions_size_nonnegative',
      sql`${t.bytes} >= 0 AND ${t.chunks} >= 0`,
    ),
    check(
      'import_sessions_status_nonempty',
      sql`length(btrim(${t.status})) > 0`,
    ),
    check(
      'import_sessions_expiry_valid',
      sql`${t.expiresAt} > ${t.consentRecordedAt}`,
    ),
  ],
);

export const deletionRequests = pgTable(
  'deletion_requests',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id'),
    status: text('status').notNull(),
    progress: jsonb('progress').notNull().default({}),
    suppressionIdentifier: text('suppression_identifier'),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'deletion_requests_status_nonempty',
      sql`length(btrim(${t.status})) > 0`,
    ),
    check(
      'deletion_requests_progress_object',
      sql`jsonb_typeof(${t.progress}) = 'object'`,
    ),
    check(
      'deletion_requests_updated_at_valid',
      sql`${t.updatedAt} >= ${t.requestedAt}`,
    ),
  ],
);
