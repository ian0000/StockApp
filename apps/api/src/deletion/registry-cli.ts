import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createPostgresPool,
  createDatabase,
} from '../infrastructure/postgres/client.js';
import { readDatabaseUrl } from '../infrastructure/postgres/config.js';
import { readSuppressionSecret } from './model.js';
import {
  applySuppressionRegistry,
  exportSuppressionRegistry,
} from './registry.js';

export async function runRegistryCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const [action, flag, path] = args;
  if (
    args.length !== 3 ||
    !path ||
    !(
      (action === 'export' && flag === '--output') ||
      (action === 'apply' && flag === '--input')
    )
  )
    throw new Error(
      'Use export --output <private-file> or apply --input <private-file>.',
    );
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new Error('Auth maintenance key required.');
  const keys = {
    suppressionSecret: readSuppressionSecret(env),
    authSecret: env.BETTER_AUTH_SECRET,
  };
  const pool = createPostgresPool(readDatabaseUrl(env));
  try {
    const database = createDatabase(pool);
    if (action === 'export') {
      const registry = await exportSuppressionRegistry(database);
      await writeFile(resolve(path), JSON.stringify(registry, null, 2) + '\n', {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
    } else
      await applySuppressionRegistry(
        database,
        JSON.parse(await readFile(resolve(path), 'utf8')),
        keys,
      );
  } finally {
    await pool.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await runRegistryCli(process.argv.slice(2));
    console.info('Suppression maintenance complete.');
  } catch {
    console.error(
      'Suppression maintenance failed. Check configuration and private input.',
    );
    process.exitCode = 1;
  }
}
