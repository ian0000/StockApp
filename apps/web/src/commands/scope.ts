import { SessionController, privateQueryKey } from '../auth/session.js';
export type CommandScope = {
  generation: number;
  businessId: string;
  inventoryId: string;
  currency: string;
};
export function commandScope(session: SessionController): CommandScope | null {
  const view = session.snapshot();
  if (
    view.kind !== 'BUSINESS_ACTIVE_ENABLED' ||
    !view.me.business ||
    !view.me.inventory
  )
    return null;
  return {
    generation: view.generation,
    businessId: view.me.business.id,
    inventoryId: view.me.inventory.id,
    currency: view.me.inventory.currency,
  };
}
export const scopedKey = (scope: CommandScope, ...parts: string[]) =>
  privateQueryKey(
    scope.generation,
    scope.businessId,
    scope.inventoryId,
    ...parts,
  );
