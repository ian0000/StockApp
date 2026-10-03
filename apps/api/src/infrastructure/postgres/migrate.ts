import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createPostgresPool } from './client.js';
import { readDatabaseUrl } from './config.js';

// Same relative location from src/ and compiled dist/; SQL stays in apps/api/drizzle.
export const migrationsFolder = fileURLToPath(
  new URL('../../../drizzle/', import.meta.url),
);

export async function migrateDatabase(
  pool: pg.Pool,
  folder = migrationsFolder,
): Promise<void> {
  const client = await pool.connect();
  try {
    // Serialize explicit migration runners, independent of future Inventory command locks.
    await client.query('SELECT pg_advisory_lock(1937006960, 2)');
    try {
      await migrate(drizzle(client), { migrationsFolder: folder });
    } finally {
      await client.query('SELECT pg_advisory_unlock(1937006960, 2)');
    }
  } finally {
    client.release();
  }
}

export async function runMigrations(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const pool = createPostgresPool(readDatabaseUrl(env));
  try {
    await migrateDatabase(pool);
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await runMigrations();
    console.info('PostgreSQL migrations complete.');
  } catch {
    console.error(
      'PostgreSQL migration failed. Check configuration and database availability.',
    );
    process.exitCode = 1;
  }
}
