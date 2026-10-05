import { createTimestampMs, type TimestampMs } from '@stock-app/domain';

export interface CommandTimes {
  readonly occurredAt: TimestampMs;
  readonly createdAt: TimestampMs;
}

export function validateCommandTimes(times: CommandTimes): void {
  createTimestampMs(times.occurredAt, 'Commercial occurrence');
  createTimestampMs(times.createdAt, 'Original creation');
}

export function requireNewIdentities(ids: readonly string[]): void {
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0 || id.trim() !== id)
      throw new TypeError(
        'Caller identities must be nonempty strings without surrounding whitespace.',
      );
  }
  if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length)
    throw new TypeError('Duplicate caller identities are not allowed.');
}

export function authoritativeUpdatedAt(
  entity: { readonly createdAt: TimestampMs; readonly updatedAt: TimestampMs },
  serverTime: TimestampMs,
): TimestampMs {
  return Math.max(
    entity.createdAt,
    entity.updatedAt,
    createTimestampMs(serverTime, 'Authoritative update'),
  );
}
