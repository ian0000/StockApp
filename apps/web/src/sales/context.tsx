import {
  createContext,
  useContext,
  useSyncExternalStore,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { ProductReadDto } from '@stock-app/contracts';
import type { SalesController } from './controller.js';
import type { CartLine } from './cart.js';
import { useSessionView } from '../auth/context.js';
import type { SessionController } from '../auth/session.js';
import { commandScope } from '../commands/scope.js';
export const SalesContext = createContext<SalesController | null>(null);
export function useSales() {
  const controller = useContext(SalesContext);
  if (!controller) throw new Error('Missing Sales provider');
  return controller;
}
export function useSaleMutation() {
  const controller = useSales();
  return useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
}
const emptySale = { kind: 'READY', message: '' } as const;
const noSubscribe = () => () => {};
const emptySnapshot = () => emptySale;
type DraftContext = {
  cart: readonly CartLine[];
  error: string;
  change: (update: (cart: readonly CartLine[]) => CartLine[]) => void;
  clear: () => void;
  refresh: (reads: readonly ProductReadDto[]) => void;
};
export const SaleDraftContext = createContext<DraftContext | null>(null);
export function SaleDraftProvider({
  children,
  session,
  sales,
}: {
  children: ReactNode;
  session: SessionController;
  sales: SalesController | null;
}) {
  useSessionView();
  const scope = commandScope(session),
    key = scope
      ? `${scope.generation}/${scope.businessId}/${scope.inventoryId}`
      : '';
  const view = useSyncExternalStore(
    sales?.subscribe ?? noSubscribe,
    sales?.snapshot ?? emptySnapshot,
    sales?.snapshot ?? emptySnapshot,
  );
  const [draft, setDraft] = useState<{
    key: string;
    cart: CartLine[];
    error: string;
  }>({ key, cart: [], error: '' });
  useEffect(
    () => session.onBoundary(() => setDraft({ key: '', cart: [], error: '' })),
    [session],
  );
  useEffect(() => {
    if (key && draft.key !== key) setDraft({ key, cart: [], error: '' });
  }, [key, draft.key]);
  useEffect(() => {
    if (view.kind === 'ACCEPTED') setDraft({ key, cart: [], error: '' });
  }, [view.kind, key]);
  const cart =
    draft.key === key && key && view.kind !== 'ACCEPTED' ? draft.cart : [];
  const clear = useCallback(
    () => setDraft({ key, cart: [], error: '' }),
    [key],
  );
  const change = useCallback(
    (update: (cart: readonly CartLine[]) => CartLine[]) => {
      sales?.cartEdited();
      setDraft((old) => {
        try {
          return {
            key,
            cart: update(old.key === key ? old.cart : []),
            error: '',
          };
        } catch {
          return {
            ...old,
            error:
              'No pudimos cambiar esa cantidad. Usa un número entero dentro del rango permitido.',
          };
        }
      });
    },
    [key, sales],
  );
  const refresh = useCallback(
    (reads: readonly ProductReadDto[]) =>
      setDraft((old) =>
        old.key !== key
          ? old
          : {
              ...old,
              cart: old.cart.map((line) => {
                const read = reads.find(
                  (r) =>
                    r.product.id.toLowerCase() === line.productId.toLowerCase(),
                );
                return read
                  ? {
                      ...line,
                      name: read.product.name,
                      variant: read.product.variant,
                      stock: read.state.stock,
                    }
                  : line;
              }),
            },
      ),
    [key],
  );
  return (
    <SaleDraftContext.Provider
      value={{
        cart,
        error: draft.key === key ? draft.error : '',
        clear,
        change,
        refresh,
      }}
    >
      {children}
    </SaleDraftContext.Provider>
  );
}
export function useSaleDraft() {
  const draft = useContext(SaleDraftContext);
  if (!draft) throw new Error('Missing Sale draft provider');
  return draft;
}
