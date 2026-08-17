export type TimestampMs = number;

export function createTimestampMs(
  value: number,
  label = 'Timestamp',
): TimestampMs {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }

  if (value < 0) {
    throw new RangeError(`${label} must be non-negative.`);
  }

  return value;
}
