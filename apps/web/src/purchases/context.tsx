import { createContext, useContext, useSyncExternalStore } from 'react';
import type { PurchasesController } from './controller.js';
export const PurchasesContext = createContext<PurchasesController | null>(null);
export function usePurchases() {
  const value = useContext(PurchasesContext);
  if (!value) throw new Error('Missing Purchases provider');
  return value;
}
export function usePurchaseMutation() {
  const controller = usePurchases();
  return useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
}
