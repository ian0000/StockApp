import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { createPostgresPool } from '../../src/infrastructure/postgres/client.js';
import { readTestDatabaseUrl } from '../../src/infrastructure/postgres/config.js';

export function id(): string {
  return `019a0000-0000-7000-8000-${randomUUID().slice(-12)}`;
}

export async function disposableDatabase(t: TestContext) {
  const url = readTestDatabaseUrl(process.env);
  const admin = createPostgresPool(url);
  const name = `stockapp_test_${randomUUID().replaceAll('-', '')}`;
  // Identifiers are generated locally; URL inputs never become SQL identifiers.
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    await admin.end();
    throw error;
  }
  const target = new URL(url);
  target.pathname = `/${name}`;
  const pool = createPostgresPool(target.href);
  t.after(async () => {
    await pool.end();
    try {
      await admin.query(`DROP DATABASE "${name}"`);
    } finally {
      await admin.end();
    }
  });
  return pool;
}
