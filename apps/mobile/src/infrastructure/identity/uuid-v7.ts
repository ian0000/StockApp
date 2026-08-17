import type { Clock } from '@stock-app/application';
import { createTimestampMs } from '@stock-app/domain';
import { v7 } from 'uuid';

export function generateUuidV7(clock: Clock, random: Uint8Array): string {
  const timestamp = createTimestampMs(clock.now(), 'UUID timestamp');

  return v7({ msecs: timestamp, random });
}
