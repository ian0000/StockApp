import { createReadStream } from 'node:fs';
import { open, mkdir, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { assertCiphertext, fileDigest } from './encryption.js';
import {
  validateManifest,
  validateObjectKey,
  type BackupManifest,
} from './manifest.js';
import { runProcess, safeEnvironment } from './process.js';
import type { BackupTools } from './tools.js';

export const bucket = 'stockapp-uat-backups';
export interface Transport {
  upload(key: string, file: string, signal?: AbortSignal): Promise<void>;
  download(key: string, file: string, signal?: AbortSignal): Promise<void>;
  deleteSmoke(key: string, allocatedKey: string): Promise<void>;
}
export interface Credentials {
  accessKey: string;
  secretKey: string;
}
export interface R2Config {
  endpoint: string;
  bucket: string;
  writer: Credentials;
  reader: Credentials;
}
export function readR2Config(env: NodeJS.ProcessEnv): R2Config {
  const config = {
    endpoint: env.BACKUP_R2_ENDPOINT ?? '',
    bucket: env.BACKUP_R2_BUCKET ?? '',
    writer: {
      accessKey: env.BACKUP_R2_WRITER_ACCESS_KEY ?? '',
      secretKey: env.BACKUP_R2_WRITER_SECRET_KEY ?? '',
    },
    reader: {
      accessKey: env.BACKUP_R2_READER_ACCESS_KEY ?? '',
      secretKey: env.BACKUP_R2_READER_SECRET_KEY ?? '',
    },
  };
  validateR2Config(config);
  return config;
}
export function validateR2Config(config: R2Config) {
  if (config.bucket !== bucket)
    throw new Error('Only the approved R2 bucket is allowed.');
  if (
    !/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com\/?$/.test(
      config.endpoint,
    )
  )
    throw new Error(
      'An explicit HTTPS Cloudflare R2 account endpoint is required.',
    );
  for (const credential of [config.writer, config.reader])
    if (
      !/^[a-zA-Z0-9_-]{8,128}$/.test(credential.accessKey) ||
      !/^[a-zA-Z0-9_-]{16,256}$/.test(credential.secretKey)
    )
      throw new Error('Scoped writer and reader R2 credentials are required.');
  if (
    config.writer.accessKey === config.reader.accessKey ||
    config.writer.secretKey === config.reader.secretKey
  )
    throw new Error(
      'Writer and recovery reader must use separate credentials.',
    );
}
export function rcloneInvocation(config: R2Config, role: 'writer' | 'reader') {
  validateR2Config(config);
  const credential = config[role];
  return {
    env: safeEnvironment({
      RCLONE_CONFIG_BACKUP_TYPE: 's3',
      RCLONE_CONFIG_BACKUP_PROVIDER: 'Cloudflare',
      RCLONE_CONFIG_BACKUP_ENDPOINT: config.endpoint,
      RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID: credential.accessKey,
      RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY: credential.secretKey,
      RCLONE_CONFIG_BACKUP_ENV_AUTH: 'false',
    }),
    args: [
      '--config',
      process.platform === 'win32' ? 'NUL' : '/dev/null',
      '--s3-no-check-bucket',
      '--retries',
      '1',
      '--low-level-retries',
      '1',
      '--stats',
      '0',
      '--log-level',
      'ERROR',
    ],
  };
}
function guardDelete(key: string, allocatedKey: string) {
  validateObjectKey(key, 'qa-smoke');
  if (key !== allocatedKey)
    throw new Error('Deletion is limited to this smoke allocation.');
}
export function rcloneTransport(
  tools: BackupTools,
  config: R2Config,
): Transport {
  const allocated = new Set<string>();
  const writer = rcloneInvocation(config, 'writer');
  const reader = rcloneInvocation(config, 'reader');
  const remote = (key: string) => {
    validateObjectKey(key);
    return `backup:${bucket}/${key}`;
  };
  return {
    async upload(key, file, signal) {
      await assertCiphertext(file);
      await runProcess(
        tools.rclone,
        [
          'copyto',
          file,
          remote(key),
          ...writer.args,
          '--immutable',
          '--error-on-no-transfer',
          '--no-traverse',
          // Pinned rclone maps this to PutObject and CompleteMultipartUpload.
          // The destination condition closes the HEAD/PUT race; no overwrite fallback.
          '--header-upload',
          'If-None-Match: *',
        ],
        { env: writer.env, signal },
      );
      allocated.add(key);
    },
    async download(key, file, signal) {
      const output = await open(file, 'wx', 0o600);
      try {
        await runProcess(tools.rclone, ['cat', remote(key), ...reader.args], {
          env: reader.env,
          output: output.createWriteStream(),
          signal,
        });
      } catch {
        await rm(file, { force: true });
        throw new Error('Encrypted object download failed.');
      }
    },
    async deleteSmoke(key, allocatedKey) {
      guardDelete(key, allocatedKey);
      if (!allocated.has(key))
        throw new Error('Smoke object was not allocated by this transport.');
      await runProcess(
        tools.rclone,
        ['deletefile', remote(key), ...writer.args],
        { env: writer.env },
      );
      allocated.delete(key);
    },
  };
}
// Filesystem simulation stores only ciphertext and has real exclusive writes.
// It never contacts a provider; each test owns and cleans its private directory.
export function localTransport(root: string): Transport {
  const allocated = new Set<string>();
  const path = (key: string) => {
    validateObjectKey(key);
    return join(root, ...key.split('/'));
  };
  return {
    async upload(key, file, signal) {
      await assertCiphertext(file);
      const destination = path(key);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      const output = await open(destination, 'wx', 0o600);
      try {
        await pipeline(createReadStream(file), output.createWriteStream(), {
          signal,
        });
        allocated.add(key);
      } catch {
        await rm(destination, { force: true });
        throw new Error('Simulated upload failed.');
      }
    },
    async download(key, file, signal) {
      const source = path(key);
      const output = await open(file, 'wx', 0o600);
      try {
        await pipeline(createReadStream(source), output.createWriteStream(), {
          signal,
        });
      } catch {
        await rm(file, { force: true });
        throw new Error('Simulated download failed.');
      }
    },
    async deleteSmoke(key, allocatedKey) {
      guardDelete(key, allocatedKey);
      if (!allocated.has(key))
        throw new Error('Smoke object was not allocated by this transport.');
      await rm(path(key));
      allocated.delete(key);
    },
  };
}
export async function verifiedDownload(
  transport: Transport,
  input: unknown,
  file: string,
  signal?: AbortSignal,
) {
  const manifest = validateManifest(input);
  await transport.download(manifest.objectKey, file, signal);
  try {
    await assertCiphertext(file);
    const actual = await fileDigest(file);
    if (
      actual.sha256 !== manifest.ciphertextSha256 ||
      actual.bytes !== manifest.encryptedBytes
    )
      throw new Error('Ciphertext integrity mismatch.');
  } catch {
    await rm(file, { force: true });
    throw new Error('Downloaded ciphertext integrity failed.');
  }
}
export async function verifiedUpload(
  transport: Transport,
  manifest: BackupManifest,
  file: string,
  verificationFile: string,
  signal?: AbortSignal,
) {
  validateManifest(manifest);
  await assertCiphertext(file);
  const actual = await fileDigest(file);
  if (
    actual.sha256 !== manifest.ciphertextSha256 ||
    actual.bytes !== manifest.encryptedBytes
  )
    throw new Error('Local ciphertext metadata mismatch.');
  await transport.upload(manifest.objectKey, file, signal);
  await verifiedDownload(transport, manifest, verificationFile, signal);
  // A byte-verified upload is still NOT a verified PostgreSQL restore.
  return {
    objectKey: manifest.objectKey,
    ciphertextSha256: actual.sha256,
    encryptedBytes: actual.bytes,
  };
}
