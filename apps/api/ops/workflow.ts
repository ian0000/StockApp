import { randomUUID } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  validateManifest,
  objectKey,
  type Kind,
  type BackupManifest,
} from './manifest.js';
import {
  encryptFile,
  decryptFile,
  ephemeralIdentity,
  fileDigest,
} from './encryption.js';
import { privateWorkspace } from './private-files.js';
import { verifiedUpload, type Transport } from './transport.js';
import type { BackupTools } from './tools.js';

export function manifestFor(
  kind: Kind,
  recipient: string,
  integrity: { bytes: number; sha256: string },
  options: {
    sourceCommit: string;
    keyVersion: string;
    suppressionKeyVersion: string;
  },
): BackupManifest {
  const backupId = randomUUID();
  return validateManifest({
    version: 1,
    backupId,
    environment: 'uat',
    kind,
    createdAt: new Date().toISOString(),
    sourceCommit: options.sourceCommit,
    postgresClientVersion: '18.6',
    postgresServerVersion: '18.6',
    objectKey: objectKey(kind, backupId),
    encryptedBytes: integrity.bytes,
    ciphertextSha256: integrity.sha256,
    recipient,
    keyVersion: options.keyVersion,
    suppressionKeyVersion: options.suppressionKeyVersion,
    restoreVerification: 'NOT_VERIFIED',
    retentionPolicy:
      kind === 'postgres'
        ? 'postgres-up-to-30-days'
        : kind === 'deletion-suppressions'
          ? 'last-retained-containing-backup-plus-7-days'
          : 'synthetic-smoke',
  });
}
export function smokeOptIn(args: readonly string[]) {
  if (args.length !== 1 || args[0] !== '--remote-smoke')
    throw new Error('Remote smoke requires explicit --remote-smoke opt-in.');
  if (process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true')
    throw new Error('Remote provider smoke is prohibited in CI.');
}
export async function syntheticSmoke(
  tools: BackupTools,
  transport: Transport,
  sourceCommit: string,
  signal?: AbortSignal,
) {
  return privateWorkspace(async (directory) => {
    const identity = join(directory, 'ephemeral-qa-identity');
    const recipient = await ephemeralIdentity(tools, identity);
    const plaintext = join(directory, 'synthetic-input');
    await writeFile(
      plaintext,
      'StockApp DEV-02B synthetic transport rehearsal\n',
      { flag: 'wx', mode: 0o600 },
    );
    const encrypted = join(directory, 'encrypted.age');
    const manifest = manifestFor(
      'qa-smoke',
      recipient,
      await encryptFile(tools, plaintext, encrypted, recipient, signal),
      {
        sourceCommit,
        keyVersion: 'ephemeral-qa',
        suppressionKeyVersion: 'not-used-qa',
      },
    );
    // Exactly one new object. Leave allocation in place on failure/uncertainty;
    // never delete a pre-existing object when a conditional write was rejected.
    await verifiedUpload(
      transport,
      manifest,
      encrypted,
      join(directory, 'downloaded.age'),
      signal,
    );
    const decrypted = join(directory, 'decrypted');
    await decryptFile(
      tools,
      join(directory, 'downloaded.age'),
      decrypted,
      identity,
      signal,
    );
    if (
      (await fileDigest(decrypted)).sha256 !==
      (await fileDigest(plaintext)).sha256
    )
      throw new Error('Synthetic decrypted content mismatch.');
    await transport.deleteSmoke(manifest.objectKey, manifest.objectKey);
    return {
      status: 'PASS',
      objectKey: manifest.objectKey,
      encryptedBytes: manifest.encryptedBytes,
      ciphertextSha256: manifest.ciphertextSha256,
    };
  });
}
export async function saveManifest(
  tools: BackupTools,
  manifest: BackupManifest,
  directory: string,
) {
  const validated = validateManifest(manifest);
  const source = join(directory, 'manifest.json');
  await writeFile(source, JSON.stringify(validated), {
    flag: 'wx',
    mode: 0o600,
  });
  await encryptFile(
    tools,
    source,
    join(directory, 'manifest.age'),
    validated.recipient,
  );
}
export async function loadManifest(path: string) {
  return validateManifest(JSON.parse(await readFile(path, 'utf8')));
}
