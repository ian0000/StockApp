import type { Clock } from '@stock-app/application';
import * as Crypto from 'expo-crypto';

import { generateUuidV7 } from './uuid-v7';

export class UuidV7Generator {
  constructor(private readonly clock: Clock) {}

  generate(): string {
    const random = Crypto.getRandomValues(new Uint8Array(16));

    return generateUuidV7(this.clock, random);
  }
}
