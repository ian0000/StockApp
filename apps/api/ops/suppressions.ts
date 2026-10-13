import type pg from 'pg';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  decodeRegistry,
  type SuppressionRegistry,
} from '../src/deletion/registry.js';
import { suppressionIdentifier } from '../src/deletion/model.js';
import { runProcess, safeEnvironment } from './process.js';
import { qaDatabase } from './postgres.js';
import { privateOutputParent } from './private-files.js';

export async function registryCli(
  action: 'export' | 'apply',
  connectionString: string,
  path: string,
  keys: { authSecret: string; suppressionSecret: string },
  signal?: AbortSignal,
) {
  qaDatabase(connectionString);
  if (keys.authSecret.length < 32 || keys.suppressionSecret.length < 32)
    throw new Error('Maintenance custody keys required.');
  await privateOutputParent(path);
  const cli = resolve(import.meta.dirname, '../dist/deletion/registry-cli.js');
  await stat(cli);
  await runProcess(
    process.execPath,
    [cli, action, action === 'export' ? '--output' : '--input', path],
    {
      env: safeEnvironment({
        DATABASE_URL: connectionString,
        BETTER_AUTH_SECRET: keys.authSecret,
        DELETION_SUPPRESSION_SECRET: keys.suppressionSecret,
      }),
      signal,
    },
  );
  if (action === 'export')
    return decodeRegistry(JSON.parse(await readFile(path, 'utf8')));
}

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
type RecoveryDatabase = Pick<pg.Pool, 'query'>;
export interface RecoveryEvidence {
  deleted: string[];
  survivors: { id: string; inventoryId: string | null; digest: string }[];
}
// Private in-memory evidence belongs exclusively to the isolated restored DB.
// It is neither a suppression-format extension nor a persisted list of deleted PII.
async function accountDigest(
  pool: RecoveryDatabase,
  userId: string,
  inventoryId: string | null,
) {
  const parts: unknown[] = [];
  for (const table of ['user', 'account', 'session']) {
    const column = table === 'user' ? 'id' : 'user_id';
    parts.push(
      (
        await pool.query(
          `SELECT row_to_json(t)::text AS row FROM "${table}" t WHERE ${column}=$1 ORDER BY row_to_json(t)::text`,
          [userId],
        )
      ).rows,
    );
  }
  parts.push(
    (
      await pool.query(
        'SELECT row_to_json(t)::text AS row FROM businesses t WHERE owner_user_id=$1 ORDER BY row_to_json(t)::text',
        [userId],
      )
    ).rows,
  );
  if (inventoryId)
    for (const table of [
      'inventories',
      'products',
      'inventory_states',
      'inventory_movements',
      'sales',
      'sale_items',
      'purchases',
      'stock_adjustments',
      'inventory_change_sets',
    ]) {
      const column = table === 'inventories' ? 'id' : 'inventory_id';
      parts.push(
        (
          await pool.query(
            `SELECT row_to_json(t)::text AS row FROM "${table}" t WHERE ${column}=$1 ORDER BY row_to_json(t)::text`,
            [inventoryId],
          )
        ).rows,
      );
    }
  parts.push(
    (
      await pool.query(
        'SELECT row_to_json(t)::text AS row FROM operation_receipts t WHERE business_id IN (SELECT id FROM businesses WHERE owner_user_id=$1) ORDER BY row_to_json(t)::text',
        [userId],
      )
    ).rows,
  );
  return digest(parts);
}
export async function captureRecoveryEvidence(
  pool: RecoveryDatabase,
  registry: SuppressionRegistry,
  trustedOriginalKey: string,
): Promise<RecoveryEvidence> {
  decodeRegistry(registry);
  if (trustedOriginalKey.length < 32)
    throw new Error(
      'Original suppression custody key required for independent verification.',
    );
  const accounts = (
    await pool.query<{ id: string; inventoryId: string | null }>(
      'SELECT u.id,i.id AS "inventoryId" FROM "user" u LEFT JOIN businesses b ON b.owner_user_id=u.id LEFT JOIN inventories i ON i.business_id=b.id ORDER BY u.id',
    )
  ).rows;
  const identifiers = new Set(registry.identifiers);
  const result: RecoveryEvidence = { deleted: [], survivors: [] };
  for (const row of accounts) {
    if (identifiers.has(suppressionIdentifier(trustedOriginalKey, row.id)))
      result.deleted.push(row.id);
    else
      result.survivors.push({
        ...row,
        digest: await accountDigest(pool, row.id, row.inventoryId),
      });
  }
  return result;
}
export async function verifyRecoveryEvidence(
  pool: RecoveryDatabase,
  evidence: RecoveryEvidence,
) {
  const remaining = (
    await pool.query<{ id: string }>('SELECT id FROM "user" ORDER BY id')
  ).rows.map((row) => row.id);
  if (evidence.deleted.some((id) => remaining.includes(id)))
    throw new Error('Suppressed identity remains in recovered database.');
  if (digest(remaining) !== digest(evidence.survivors.map((row) => row.id)))
    throw new Error('Surviving account set changed during recovery.');
  for (const row of evidence.survivors)
    if ((await accountDigest(pool, row.id, row.inventoryId)) !== row.digest)
      throw new Error('Surviving account data changed during recovery.');
}
