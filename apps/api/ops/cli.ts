import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPostgresPool } from '../src/infrastructure/postgres/client.js';
import {
  prepareTools,
  verifyTools,
  type BackupTools,
  versions,
} from './tools.js';
import { privateWorkspace, privateOutputParent } from './private-files.js';
import { encryptFile, decryptFile, fileDigest } from './encryption.js';
import { pgTools, qaDatabase, withRecoveryDatabase } from './postgres.js';
import {
  registryCli,
  captureRecoveryEvidence,
  verifyRecoveryEvidence,
} from './suppressions.js';
import {
  localTransport,
  rcloneTransport,
  readR2Config,
  verifiedDownload,
  verifiedUpload,
} from './transport.js';
import {
  manifestFor,
  loadManifest,
  saveManifest,
  smokeOptIn,
  syntheticSmoke,
} from './workflow.js';
import { decodeRegistry } from '../src/deletion/registry.js';

function required(env: NodeJS.ProcessEnv, name: string) {
  if (!env[name])
    throw new Error('Required operator configuration is missing.');
  return env[name];
}
export function installedTools(env: NodeJS.ProcessEnv): BackupTools {
  const directory = required(env, 'BACKUP_TOOLS_DIRECTORY');
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const platform = process.platform === 'win32' ? 'windows' : 'linux';
  return {
    age: join(directory, 'age', `age${suffix}`),
    keygen: join(directory, 'age', `age-keygen${suffix}`),
    rclone: join(
      directory,
      `rclone-v${versions.rclone}-${platform}-amd64`,
      `rclone${suffix}`,
    ),
  };
}
export async function runBackupCli(
  args: readonly string[],
  env = process.env,
  signal?: AbortSignal,
  provision: <U>(operation: () => Promise<U>) => Promise<U> = (operation) =>
    operation(),
) {
  if (args[0] === 'prepare-tools' && args.length === 2) {
    const output = resolve(args[1]);
    await privateOutputParent(output);
    await mkdir(output, { mode: 0o700 });
    await prepareTools(output);
    return { status: 'TOOLS_READY', versions };
  }
  const tools = installedTools(env);
  await verifyTools(tools);
  if (args[0] === '--remote-smoke') {
    smokeOptIn(args);
    return syntheticSmoke(
      tools,
      rcloneTransport(tools, readR2Config(env)),
      required(env, 'BACKUP_SOURCE_COMMIT'),
      signal,
    );
  }
  const action = args[0];
  if (
    !['qa-backup', 'qa-suppressions', 'qa-recover'].includes(action) ||
    args.length !== 1
  )
    throw new Error(
      'Use prepare-tools <private-new-directory>, qa-backup, qa-suppressions, qa-recover or --remote-smoke.',
    );
  const source = required(env, 'BACKUP_QA_SOURCE_URL');
  qaDatabase(source);
  const options = {
    sourceCommit: required(env, 'BACKUP_SOURCE_COMMIT'),
    keyVersion: required(env, 'BACKUP_AGE_KEY_VERSION'),
    suppressionKeyVersion: required(env, 'BACKUP_SUPPRESSION_KEY_VERSION'),
  };
  const pgOptions = {
    bin: env.TEST_POSTGRES_BIN,
    container: env.BACKUP_QA_POSTGRES_CONTAINER,
  };
  const store = required(env, 'BACKUP_QA_STORE_DIRECTORY');
  await privateOutputParent(join(store, 'artifact'));
  await stat(store);
  const transport = localTransport(store);
  return privateWorkspace(async (directory) => {
    if (action !== 'qa-recover') {
      const plain = join(directory, 'input');
      if (action === 'qa-backup') {
        const pool = createPostgresPool(source);
        try {
          const server = (
            await pool.query<{ server_version: string }>('SHOW server_version')
          ).rows[0].server_version;
          if (!/^18\.6(?:\s|$)/.test(server))
            throw new Error('PostgreSQL 18.6 server required.');
          await (
            await pgTools(source, pgOptions)
          ).dump(plain, undefined, signal);
        } finally {
          await pool.end();
        }
      } else
        await registryCli(
          'export',
          source,
          plain,
          {
            authSecret: required(env, 'BETTER_AUTH_SECRET'),
            suppressionSecret: required(env, 'DELETION_SUPPRESSION_SECRET'),
          },
          signal,
        );
      const recipient = required(env, 'BACKUP_AGE_RECIPIENT');
      const cipher = join(directory, 'payload.age');
      const manifest = manifestFor(
        action === 'qa-backup' ? 'postgres' : 'deletion-suppressions',
        recipient,
        await encryptFile(tools, plain, cipher, recipient, signal),
        options,
      );
      await verifiedUpload(
        transport,
        manifest,
        cipher,
        join(directory, 'verification.age'),
        signal,
      );
      await saveManifest(tools, manifest, directory);
      // Private package for the operator, not a CI artifact or a public manifest.
      const packageDirectory = join(store, `package-${manifest.backupId}`);
      await mkdir(packageDirectory, { mode: 0o700 });
      await copyFile(
        join(directory, 'manifest.age'),
        join(packageDirectory, 'manifest.age'),
      );
      return {
        status: 'BYTE_VERIFIED_ONLY',
        package: packageDirectory,
        objectKey: manifest.objectKey,
        manifestCiphertextSha256: (
          await fileDigest(join(packageDirectory, 'manifest.age'))
        ).sha256,
      };
    }
    const identity = required(env, 'BACKUP_AGE_IDENTITY_FILE');
    const decode = async (
      name: 'POSTGRES' | 'SUPPRESSIONS',
      kind: 'postgres' | 'deletion-suppressions',
    ) => {
      const encryptedManifest = required(env, `BACKUP_${name}_MANIFEST_FILE`);
      const trustedDigest = required(env, `BACKUP_${name}_MANIFEST_SHA256`);
      if (
        !/^[a-f0-9]{64}$/.test(trustedDigest) ||
        (await fileDigest(encryptedManifest)).sha256 !== trustedDigest
      )
        throw new Error(
          'Manifest differs from the independently custodied descriptor.',
        );
      const clearManifest = join(directory, `${name}.manifest`);
      await decryptFile(
        tools,
        encryptedManifest,
        clearManifest,
        identity,
        signal,
      );
      const manifest = await loadManifest(clearManifest);
      if (
        manifest.kind !== kind ||
        manifest.sourceCommit !== options.sourceCommit ||
        manifest.keyVersion !== options.keyVersion ||
        manifest.suppressionKeyVersion !== options.suppressionKeyVersion
      )
        throw new Error('Backup origin or custody version mismatch.');
      const downloaded = join(directory, `${name}.age`);
      await verifiedDownload(transport, manifest, downloaded, signal);
      const plaintext = join(directory, `${name}.plain`);
      await decryptFile(tools, downloaded, plaintext, identity, signal);
      return plaintext;
    };
    const archive = await decode('POSTGRES', 'postgres');
    const registryFile = await decode('SUPPRESSIONS', 'deletion-suppressions');
    const registry = decodeRegistry(
      JSON.parse(await readFile(registryFile, 'utf8')),
    );
    const trustedKey = required(env, 'BACKUP_VERIFY_SUPPRESSION_SECRET');
    const applyKey = required(env, 'DELETION_SUPPRESSION_SECRET');
    // The original key comes from independently selected human custody. This
    // equality is a local configuration guard, not a new registry authenticator.
    if (trustedKey !== applyKey)
      throw new Error(
        'Apply key differs from trusted original suppression custody.',
      );
    return withRecoveryDatabase(
      required(env, 'TEST_DATABASE_URL'),
      source,
      async (target) => {
        const pool = target.pool;
        await (
          await pgTools(target.connectionString, pgOptions)
        ).restore(archive, target, source, signal);
        const evidence = await captureRecoveryEvidence(
          pool,
          registry,
          trustedKey,
        );
        await registryCli(
          'apply',
          target.connectionString,
          registryFile,
          {
            authSecret: required(env, 'BETTER_AUTH_SECRET'),
            suppressionSecret: applyKey,
          },
          signal,
        );
        await verifyRecoveryEvidence(pool, evidence);
        await writeFile(
          join(directory, 'verified'),
          'synthetic recovery verified',
          { flag: 'wx', mode: 0o600 },
        );
        // No promotion/reopen command. The owned database is dropped on return.
        return {
          status: 'SYNTHETIC_RECOVERY_VERIFIED',
          retainedDatabase: false,
        };
      },
      provision,
    );
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    console.info(
      JSON.stringify(
        await runBackupCli(
          process.argv.slice(2),
          process.env,
          controller.signal,
        ),
      ),
    );
  } catch {
    console.error(
      'Backup operator command failed; private diagnostics withheld.',
    );
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}
