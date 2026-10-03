import { sql } from 'drizzle-orm';
import { bigint, check, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const exactInteger = (name: string) => bigint(name, { mode: 'bigint' });
export const domainTimestamps = () => ({
  createdAt: exactInteger('created_at').notNull(),
  updatedAt: exactInteger('updated_at').notNull(),
});

export function safeRange(
  name: string,
  column: AnyPgColumn,
  nonnegative = false,
) {
  return check(
    name,
    nonnegative
      ? sql`${column} BETWEEN 0 AND 9007199254740991`
      : sql`${column} BETWEEN -9007199254740991 AND 9007199254740991`,
  );
}

export function timeChecks(
  name: string,
  table: { createdAt: AnyPgColumn; updatedAt: AnyPgColumn },
) {
  return [
    safeRange(`${name}_created_at_safe`, table.createdAt, true),
    safeRange(`${name}_updated_at_safe`, table.updatedAt, true),
    check(
      `${name}_updated_at_valid`,
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ];
}
