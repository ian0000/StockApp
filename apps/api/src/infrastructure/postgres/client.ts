import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

// Pool connects lazily. Never override pg's global BIGINT parser with Number.
export function createPostgresPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 2000,
    options: '-c timezone=UTC',
  });
}

export function createDatabase(pool: pg.Pool) {
  return drizzle(pool, { schema });
}
