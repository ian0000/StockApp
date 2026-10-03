import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  bigint,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const securityRateLimits = pgTable(
  'security_rate_limits',
  {
    scope: text('scope').notNull(),
    keyHash: text('key_hash').notNull(),
    count: integer('count').notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.keyHash] }),
    index('security_rate_limits_expiry_idx').on(table.expiresAt),
    check('security_rate_limits_count_check', sql`${table.count} > 0`),
    check(
      'security_rate_limits_hash_check',
      sql`${table.keyHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);
