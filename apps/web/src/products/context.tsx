import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ProductsController } from './controller.js';

export const ProductsContext = createContext<ProductsController | null>(null);
export function useProducts() {
  const controller = useContext(ProductsContext);
  if (!controller) throw new Error('Product client unavailable');
  return controller;
}
export function useProductMutation() {
  const controller = useProducts();
  return useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
}
function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}
export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
