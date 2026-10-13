import { randomUUID } from 'node:crypto';
import { validateRecipient } from './encryption.js';

export type Kind = 'postgres' | 'deletion-suppressions' | 'qa-smoke';
export interface BackupManifest {
  version: 1;
  backupId: string;
  environment: 'uat';
  kind: Kind;
  createdAt: string;
  sourceCommit: string;
  postgresClientVersion: '18.6';
  postgresServerVersion: '18.6';
  objectKey: string;
  encryptedBytes: number;
  ciphertextSha256: string;
  recipient: string;
  keyVersion: string;
  suppressionKeyVersion: string;
  restoreVerification: 'NOT_VERIFIED' | 'SYNTHETIC_VERIFIED';
  retentionPolicy:
    | 'postgres-up-to-30-days'
    | 'last-retained-containing-backup-plus-7-days'
    | 'synthetic-smoke';
}
const idPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function objectKey(kind: Kind, backupId: string = randomUUID()) {
  if (!idPattern.test(backupId)) throw new Error('Invalid backup identifier.');
  return `uat/${kind}/${backupId}/${kind}.age`;
}
export function validateObjectKey(key: string, kind?: Kind) {
  const match =
    /^uat\/(postgres|deletion-suppressions|qa-smoke)\/([a-f0-9-]+)\/\1\.age$/.exec(
      key,
    );
  if (!match || !idPattern.test(match[2]) || (kind && match[1] !== kind))
    throw new Error('Object identity is outside the authorized backup layout.');
}
const fields: (keyof BackupManifest)[] = [
  'version',
  'backupId',
  'environment',
  'kind',
  'createdAt',
  'sourceCommit',
  'postgresClientVersion',
  'postgresServerVersion',
  'objectKey',
  'encryptedBytes',
  'ciphertextSha256',
  'recipient',
  'keyVersion',
  'suppressionKeyVersion',
  'restoreVerification',
  'retentionPolicy',
];
export function validateManifest(input: unknown): BackupManifest {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('Invalid backup manifest.');
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !(field in value))
  )
    throw new Error('Incomplete or unexpected backup metadata.');
  if (
    value.version !== 1 ||
    value.environment !== 'uat' ||
    typeof value.backupId !== 'string' ||
    !idPattern.test(value.backupId) ||
    !['postgres', 'deletion-suppressions', 'qa-smoke'].includes(
      String(value.kind),
    ) ||
    typeof value.createdAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.createdAt) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    new Date(value.createdAt).toISOString() !== value.createdAt ||
    typeof value.sourceCommit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(value.sourceCommit) ||
    value.postgresClientVersion !== '18.6' ||
    value.postgresServerVersion !== '18.6' ||
    typeof value.encryptedBytes !== 'number' ||
    !Number.isSafeInteger(value.encryptedBytes) ||
    value.encryptedBytes <= 0 ||
    typeof value.ciphertextSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.ciphertextSha256) ||
    typeof value.recipient !== 'string' ||
    !['NOT_VERIFIED', 'SYNTHETIC_VERIFIED'].includes(
      String(value.restoreVerification),
    )
  )
    throw new Error('Invalid backup metadata.');
  for (const name of ['keyVersion', 'suppressionKeyVersion'] as const)
    if (
      typeof value[name] !== 'string' ||
      !/^[a-z0-9][a-z0-9.-]{0,47}$/.test(value[name])
    )
      throw new Error('Invalid custody version reference.');
  validateRecipient(value.recipient);
  if (value.objectKey !== objectKey(value.kind as Kind, value.backupId))
    throw new Error('Backup object identity mismatch.');
  const retention = {
    postgres: 'postgres-up-to-30-days',
    'deletion-suppressions': 'last-retained-containing-backup-plus-7-days',
    'qa-smoke': 'synthetic-smoke',
  };
  if (value.retentionPolicy !== retention[value.kind as Kind])
    throw new Error('Retention reference mismatch.');
  return input as BackupManifest;
}
