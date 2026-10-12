import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AdjustmentsController } from './controller.js';
export const AdjustmentsContext = createContext<AdjustmentsController | null>(
  null,
);
export function useAdjustments() {
  const controller = useContext(AdjustmentsContext);
  if (!controller) throw new Error('Missing Adjustments provider');
  return controller;
}
export function useAdjustmentMutation() {
  const controller = useAdjustments();
  return useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
}
