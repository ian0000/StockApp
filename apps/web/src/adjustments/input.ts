import type { AdjustStockCommand, ProductReadDto } from '@stock-app/contracts';
import {
  Money,
  type AdjustmentReason,
  type AdjustmentCostMode,
} from '@stock-app/domain';
import {
  PROTOCOL_VERSION,
  DOMAIN_VERSION,
  encodeMoney,
} from '@stock-app/contracts/transport';
import { v7 } from 'uuid';
import validateCommand from '../api/generated/adjust-stock-command.mjs';
export type AdjustmentForm = {
  productId: string | null;
  actualStock: string;
  reason: AdjustmentReason;
  costMode: AdjustmentCostMode;
  customUnitCost: string;
};
export const initialAdjustmentForm = (
  read?: ProductReadDto,
): AdjustmentForm => ({
  productId: read?.product.id ?? null,
  actualStock: '',
  reason: 'COUNT_CORRECTION',
  costMode: read?.state.unitCost == null ? 'CUSTOM_COST' : 'USE_CURRENT_COST',
  customUnitCost: '',
});
export const reasons: readonly { value: AdjustmentReason; label: string }[] = [
  { value: 'COUNT_CORRECTION', label: 'Conteo incorrecto' },
  { value: 'DAMAGED', label: 'Dañado' },
  { value: 'LOST', label: 'Perdido' },
  { value: 'INTERNAL_USE', label: 'Consumo interno' },
  { value: 'OTHER', label: 'Otro' },
];
export const reasonOptions = (difference: number | null) =>
  reasons.filter(
    ({ value }) =>
      difference === null ||
      difference <= 0 ||
      value === 'COUNT_CORRECTION' ||
      value === 'OTHER',
  );
export const reasonLabel = (value: AdjustmentReason) =>
  reasons.find((r) => r.value === value)?.label ?? value;
export const signedDifference = (value: number) =>
  value > 0 ? `+${value}` : String(value);
export class AdjustmentInputError extends Error {
  constructor(
    readonly field: keyof AdjustmentForm,
    message: string,
  ) {
    super(message);
  }
}
export function physicalCount(text: string) {
  const value = Number(text.trim());
  if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(value) || value < 0)
    throw new AdjustmentInputError(
      'actualStock',
      'Usa una cantidad entera y no negativa dentro del rango permitido.',
    );
  return value;
}
export function differenceFor(form: AdjustmentForm, read: ProductReadDto) {
  const actualStock = physicalCount(form.actualStock),
    difference = actualStock - read.state.stock;
  if (!Number.isSafeInteger(difference))
    throw new AdjustmentInputError(
      'actualStock',
      'La diferencia de stock es demasiado grande.',
    );
  return { actualStock, difference };
}
export function adjustmentPreview(form: AdjustmentForm, read: ProductReadDto) {
  if (
    !form.productId ||
    form.productId.toLowerCase() !== read.product.id.toLowerCase() ||
    read.product.isArchived
  )
    throw new AdjustmentInputError(
      'productId',
      'Selecciona un producto disponible.',
    );
  const { actualStock, difference } = differenceFor(form, read);
  if (!reasonOptions(difference).some((r) => r.value === form.reason))
    throw new AdjustmentInputError(
      'reason',
      'Elige un motivo válido para las unidades encontradas.',
    );
  let customUnitCost: string | null = null,
    unitCost = read.state.unitCost;
  const costMode = difference > 0 ? form.costMode : null;
  if (difference > 0) {
    if (costMode === 'USE_CURRENT_COST') {
      if (unitCost === null)
        throw new AdjustmentInputError(
          'costMode',
          'Este producto aún no tiene costo conocido. Indica el costo de las unidades encontradas.',
        );
    } else if (costMode === 'CUSTOM_COST') {
      try {
        let decimal = form.customUnitCost.trim().replace(',', '.');
        if (!/^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(decimal))
          throw new Error('Invalid cost');
        if (decimal.startsWith('.')) decimal = `0${decimal}`;
        customUnitCost = encodeMoney(Money.fromDecimal(decimal).scaledUnits);
        unitCost = customUnitCost;
      } catch {
        throw new AdjustmentInputError(
          'customUnitCost',
          'Ingresa un costo por unidad válido, con hasta seis decimales.',
        );
      }
    } else
      throw new AdjustmentInputError(
        'costMode',
        'Elige el costo de las unidades encontradas.',
      );
  }
  return { actualStock, difference, costMode, customUnitCost, unitCost };
}
export function buildAdjustment(
  form: AdjustmentForm,
  read: ProductReadDto,
): AdjustStockCommand {
  const { actualStock, difference, costMode, customUnitCost } =
    adjustmentPreview(form, read);
  if (difference === 0)
    throw new AdjustmentInputError(
      'actualStock',
      'El stock registrado ya coincide con el conteo físico.',
    );
  // Validate before allocating any identities; zero/invalid counts are never intents.
  const now = Date.now();
  const command = {
    protocolVersion: PROTOCOL_VERSION,
    domainVersion: DOMAIN_VERSION,
    commandKind: 'STOCK_ADJUST',
    operationId: v7(),
    occurredAt: now,
    dependsOn: [],
    payload: {
      stockAdjustmentId: v7(),
      movementId: v7(),
      createdAt: now,
      productId: read.product.id,
      actualStock,
      reason: form.reason,
      costMode,
      customUnitCost,
    },
    preconditions: {
      expectedStateRevision: read.state.stateRevision,
      expectedState: {
        stock: read.state.stock,
        unitCost: read.state.unitCost,
        lastMovementId: read.state.lastMovementId,
      },
    },
  };
  if (!validateCommand(command))
    throw new AdjustmentInputError('productId', 'Revisa los datos del ajuste.');
  return command;
}
