import type { Clock } from '@stock-app/application';
import { createTimestampMs, type TimestampMs } from '@stock-app/domain';

export class SystemClock implements Clock {
  now(): TimestampMs {
    return createTimestampMs(Date.now(), 'System clock timestamp');
  }
}
