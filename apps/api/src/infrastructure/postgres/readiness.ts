import pg from 'pg';
import { is } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';
import { migrationsFolder } from './migrate.js';

export const READINESS_DEADLINE_MS = 2_000;

function canonicalType(value: string): string {
  const type = value.replace(/\s/g, '').toLowerCase();
  return type === 'timestamp' ? 'timestampwithouttimezone' : type;
}

const requiredColumns = Object.values(schema)
  .filter((table) => is(table, PgTable))
  .flatMap((table) => {
    const config = getTableConfig(table);
    return config.columns.map((column) => ({
      table: config.name,
      column: column.name,
      type: canonicalType(column.getSQLType()),
      notNull: column.notNull,
    }));
  });

// Independent, single-flight health connection: public probes cannot occupy the
// business pool. No migration runner, business rows or rate-limit writes are used.
export function createReadinessCheck(connectionString: string) {
  const expectedMigrations = readMigrationFiles({ migrationsFolder });
  let active: pg.Client | undefined;
  let pending: Promise<boolean> | undefined;
  let closing = false;

  async function probe(): Promise<boolean> {
    const client = new pg.Client({
      connectionString,
      connectionTimeoutMillis: READINESS_DEADLINE_MS,
      query_timeout: READINESS_DEADLINE_MS,
      statement_timeout: 1_500,
      options: '-c default_transaction_read_only=on -c timezone=UTC',
    });
    active = client;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const work = (async () => {
        await client.connect();
        const migrations = await client.query<{
          hash: string;
          created_at: string;
        }>(
          'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at, id',
        );
        if (
          migrations.rows.length !== expectedMigrations.length ||
          !expectedMigrations.every(
            (migration, index) =>
              migrations.rows[index].hash === migration.hash &&
              migrations.rows[index].created_at ===
                String(migration.folderMillis),
          )
        )
          return false;
        const columns = await client.query<{
          table: string;
          column: string;
          type: string;
          not_null: boolean;
        }>(`
          SELECT c.relname AS "table", a.attname AS "column",
            pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
            a.attnotnull AS not_null
          FROM pg_catalog.pg_attribute a
          JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
            AND a.attnum > 0 AND NOT a.attisdropped
        `);
        return (
          !closing &&
          requiredColumns.every((required) => {
            const actual = columns.rows.find(
              (column) =>
                column.table === required.table &&
                column.column === required.column,
            );
            return (
              actual !== undefined &&
              canonicalType(actual.type) === required.type &&
              actual.not_null === required.notNull
            );
          })
        );
      })();
      const deadline = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => {
          void client.end().catch(() => {});
          resolve(false);
        }, READINESS_DEADLINE_MS);
      });
      return await Promise.race([work, deadline]);
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
      await client.end().catch(() => {});
      active = undefined;
    }
  }

  return {
    check(): Promise<boolean> {
      if (closing) return Promise.resolve(false);
      if (!pending)
        pending = probe().finally(() => {
          pending = undefined;
        });
      return pending;
    },
    async close(): Promise<void> {
      closing = true;
      await active?.end().catch(() => {});
      await pending;
    },
  };
}
