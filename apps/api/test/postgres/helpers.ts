import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import {
  mkdtemp,
  mkdir,
  readFile,
  copyFile,
  writeFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrationsFolder } from '../../src/infrastructure/postgres/migrate.js';
import { createPostgresPool } from '../../src/infrastructure/postgres/client.js';
import { readTestDatabaseUrl } from '../../src/infrastructure/postgres/config.js';
import { withProvisioningGate } from '../helpers/provisioning-gate.js';

export function id(): string {
  return `019a0000-0000-7000-8000-${randomUUID().slice(-12)}`;
}

export async function insertFixtureUser(
  pool: pg.Pool,
  userId: string,
  verified = true,
) {
  await pool.query(
    'INSERT INTO "user" (id,name,email,email_verified) VALUES ($1,$1,$2,$3)',
    [userId, `${userId}@example.test`, verified],
  );
}

export async function migrationPrefix(t: TestContext, count: number) {
  const folder = await mkdtemp(join(tmpdir(), 'stockapp-migration-prefix-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await mkdir(join(folder, 'meta'));
  const journal: { entries: { tag: string }[] } = JSON.parse(
    await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  );
  const entries = journal.entries.slice(0, count);
  for (const entry of entries)
    await copyFile(
      join(migrationsFolder, `${entry.tag}.sql`),
      join(folder, `${entry.tag}.sql`),
    );
  await writeFile(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries }),
  );
  return folder;
}

export async function disposableDatabase(t: TestContext) {
  const url = readTestDatabaseUrl(process.env);
  const admin = createPostgresPool(url);
  const name = `stockapp_test_${randomUUID().replaceAll('-', '')}`;
  const target = new URL(url);
  target.pathname = `/${name}`;
  const pool = createPostgresPool(target.href);
  let created = false;
  // Identifiers are generated locally; URL inputs never become SQL identifiers.
  try {
    await withProvisioningGate(async () => {
      await admin.query(`CREATE DATABASE "${name}"`);
      created = true;
      // Establish the fixture's first connection before another worker can DROP
      // a database and force a synchronous cluster checkpoint. Business SQL stays concurrent.
      await pool.query('SELECT 1');
    });
  } catch (error) {
    try {
      await pool.end();
      if (created)
        await withProvisioningGate(() =>
          admin.query(`DROP DATABASE "${name}"`),
        );
    } finally {
      await admin.end();
    }
    throw error;
  }
  t.after(async () => {
    try {
      await pool.end();
      await withProvisioningGate(() => admin.query(`DROP DATABASE "${name}"`));
    } finally {
      await admin.end();
    }
  });
  return pool;
}
