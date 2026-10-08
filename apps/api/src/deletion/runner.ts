import type { OwnershipDatabase } from '../ownership/context.js';
import type { DeletionKeys } from './model.js';
import {
  advanceDeletion,
  claimDeletion,
  releaseFailedDeletion,
  type DeletionHook,
} from './worker.js';

export const DELETION_SWEEP_MS = 5_000;
export function createDeletionRunner(
  database: OwnershipDatabase,
  keys: DeletionKeys,
  options: {
    clock?: () => number;
    afterWrite?: DeletionHook;
    onFailure?: () => void;
    intervalMs?: number;
  } = {},
) {
  let closing = false;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const clock = options.clock ?? Date.now;
  function sweep(): Promise<void> {
    if (closing) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      const visited: string[] = [];
      // Bounded sweep; failed work stays durable for the next timer, not a tight retry loop.
      while (!closing && visited.length < 100) {
        const claim = await claimDeletion(database, clock, visited);
        if (!claim) return;
        visited.push(claim.id);
        try {
          while (!closing) {
            const result = await advanceDeletion(
              database,
              claim,
              keys,
              clock,
              options.afterWrite,
            );
            if (result !== 'continue') break;
          }
        } catch {
          await releaseFailedDeletion(database, claim, clock);
          options.onFailure?.();
        }
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  }
  function wake() {
    void sweep().catch(() => options.onFailure?.());
  }
  return {
    sweep,
    wake,
    start() {
      if (closing || timer) return;
      timer = setInterval(wake, options.intervalMs ?? DELETION_SWEEP_MS);
      timer.unref();
      wake();
    },
    async close() {
      closing = true;
      if (timer) clearInterval(timer);
      await running;
    },
  };
}
