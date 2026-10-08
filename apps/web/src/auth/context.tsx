import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { SessionController } from './session.js';

const SessionContext = createContext<SessionController | null>(null);
export function SessionProvider({
  controller,
  children,
}: {
  controller: SessionController;
  children: ReactNode;
}) {
  useEffect(() => {
    void controller.refresh();
    const revalidate = () => {
      void controller.refresh();
    };
    window.addEventListener('focus', revalidate);
    window.addEventListener('online', revalidate);
    // Detect expiry/revocation on an open tab too; never poll commercial endpoints.
    const timer = window.setInterval(revalidate, 60_000);
    return () => {
      window.removeEventListener('focus', revalidate);
      window.removeEventListener('online', revalidate);
      window.clearInterval(timer);
      controller.dispose();
    };
  }, [controller]);
  return (
    <SessionContext.Provider value={controller}>
      {children}
    </SessionContext.Provider>
  );
}
export function useSessionController() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('Missing session context');
  return value;
}
export function useSessionView() {
  const controller = useSessionController();
  return useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
}
