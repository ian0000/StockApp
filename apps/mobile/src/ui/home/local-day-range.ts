import type { TimestampMs } from '@stock-app/domain';

export interface LocalDayRange {
  readonly fromInclusive: TimestampMs;
  readonly toExclusive: TimestampMs;
}

export function getLocalDayRange(now: Date | number): LocalDayRange {
  const instant = new Date(now instanceof Date ? now.getTime() : now);

  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('Local day range requires a valid date.');
  }

  const year = instant.getFullYear();
  const month = instant.getMonth();
  const day = instant.getDate();

  return Object.freeze({
    fromInclusive: new Date(year, month, day).getTime(),
    toExclusive: new Date(year, month, day + 1).getTime(),
  });
}
