import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createDatabase,
  createPostgresPool,
} from '../infrastructure/postgres/client.js';
import { readDatabaseUrl } from '../infrastructure/postgres/config.js';
import { setPilotAccess } from './pilot.js';

export function parsePilotArguments(args: readonly string[]) {
  const values = args[0] === '--' ? args.slice(1) : args;
  if (
    values.length !== 3 ||
    values[0] !== '--user-id' ||
    !values[1]?.trim() ||
    values[1].startsWith('--') ||
    !['--enable', '--disable'].includes(values[2])
  )
    throw new Error('Usage: pilot:access -- --user-id <id> --enable|--disable');
  return { userId: values[1], enabled: values[2] === '--enable' };
}

export async function runPilotAccess(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const input = parsePilotArguments(args);
  const pool = createPostgresPool(readDatabaseUrl(env));
  try {
    await setPilotAccess(createDatabase(pool), input.userId, input.enabled);
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await runPilotAccess(process.argv.slice(2));
    console.info('Pilot access operation complete.');
  } catch {
    console.error(
      'Pilot access failed. Check arguments, configuration and preconditions.',
    );
    process.exitCode = 1;
  }
}
