import { createContext, useContext, useSyncExternalStore } from 'react';
import type { MeResponse } from '@stock-app/contracts';
import type { AccessState } from '../auth/session.js';
import type { AccountController } from './controller.js';
export const AccountContext = createContext<AccountController | null>(null);
export const AccountMetadataContext = createContext<{
  me: MeResponse;
  kind: AccessState;
} | null>(null);
export function useAccountController() {
  const controller = useContext(AccountContext);
  if (!controller) throw new Error('Missing account context.');
  return controller;
}
export function useAccountView() {
  const controller = useAccountController();
  return useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
}
export function useAccountMetadata() {
  const value = useContext(AccountMetadataContext);
  if (!value) throw new Error('Missing account metadata.');
  return value;
}
