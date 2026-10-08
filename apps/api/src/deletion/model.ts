import { createHmac, randomUUID } from 'node:crypto';
import { createSchemaValidator } from '@stock-app/contracts';

export const phases = [
  'REVOKE',
  'PURGE_DELIVERY',
  'PURGE_DATASET',
  'PURGE_AUTH',
  'FINALIZE',
] as const;
export type Phase = (typeof phases)[number];
export interface Progress {
  phase: Phase;
  attempts: number;
  lease?: string;
}
export interface DeletionKeys {
  suppressionSecret: string;
  authSecret: string;
}
const validateProgress = createSchemaValidator({
  type: 'object',
  properties: {
    phase: { type: 'string', enum: phases },
    attempts: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    lease: { type: 'string', pattern: '^[0-9a-f-]{36}$' },
  },
  required: ['phase', 'attempts'],
  additionalProperties: false,
} as const);
export function progress(value: unknown): Progress {
  validateProgress(value);
  return value as Progress;
}
export function readSuppressionSecret(
  env: Readonly<Record<string, string | undefined>>,
): string {
  const secret = env.DELETION_SUPPRESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      'DELETION_SUPPRESSION_SECRET must contain at least 32 characters.',
    );
  return secret;
}
export function suppressionIdentifier(secret: string, userId: string): string {
  if (secret.length < 32 || !userId || userId.trim() !== userId)
    throw new Error('Invalid suppression input.');
  // Auth IDs are opaque and case-sensitive; preserve the exact stored identity.
  return createHmac('sha256', secret).update(userId).digest('hex');
}
export const newLease = randomUUID;
export function serverTime(clock: () => number): Date {
  const time = clock();
  if (
    !Number.isSafeInteger(time) ||
    time < 0 ||
    !Number.isFinite(new Date(time).getTime())
  )
    throw new Error('Invalid deletion clock.');
  return new Date(time);
}
