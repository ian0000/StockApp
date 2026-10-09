import type {
  ProductReadDto,
  RegisterPurchaseCommand,
  PriceAnalysisDto,
  RegisterPurchaseCommandResult,
} from '@stock-app/contracts';
import { Money, Percentage } from '@stock-app/domain';
import {
  canEditPurchaseMargin,
  getInitialPurchaseMargin,
  recommendPurchasePrice,
  type PurchasePriceAnalysis,
} from '@stock-app/application';
import {
  decodeMoney,
  decodePercentage,
  encodeMoney,
  PROTOCOL_VERSION,
  DOMAIN_VERSION,
} from '@stock-app/contracts/transport';
import { v7 } from 'uuid';
import { initialEditDraft } from '../products/edit.js';
import { formatMoney } from '../products/input.js';
import validateCommand from '../api/generated/register-purchase-command.mjs';
export type PurchaseForm = {
  productId: string | null;
  quantity: string;
  unitCost: string;
};
export type MarginDraft = { text: string; dirty: boolean };
export const initialPurchaseForm = (): PurchaseForm => ({
  productId: null,
  quantity: '1',
  unitCost: '',
});
export class PurchaseInputError extends Error {
  constructor(
    readonly field: 'quantity' | 'unitCost' | 'productId',
    message: string,
  ) {
    super(message);
  }
}
function normalizedDecimal(text: string) {
  const value = text.trim();
  if (!/^(?:\d+(?:[.,]\d{1,6})?|[.,]\d{1,6})$/.test(value))
    throw new TypeError('Invalid decimal');
  const decimal = value.replace(',', '.');
  return decimal.startsWith('.') ? `0${decimal}` : decimal;
}
function parsedForm(form: PurchaseForm) {
  const quantity = Number(form.quantity.trim());
  if (
    !/^\d+$/.test(form.quantity.trim()) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  )
    throw new PurchaseInputError(
      'quantity',
      'Usa una cantidad entera mayor que cero.',
    );
  let unitCost: Money;
  try {
    unitCost = Money.fromDecimal(normalizedDecimal(form.unitCost));
  } catch {
    throw new PurchaseInputError(
      'unitCost',
      'Ingresa un costo de compra por unidad válido, con hasta seis decimales.',
    );
  }
  try {
    return { quantity, unitCost, total: unitCost.multiplyByInteger(quantity) };
  } catch {
    throw new PurchaseInputError(
      'unitCost',
      'La cantidad y el costo producen un total fuera del rango permitido.',
    );
  }
}
export const purchaseTotal = (form: PurchaseForm) => parsedForm(form).total;
export function buildPurchase(
  form: PurchaseForm,
  read: ProductReadDto,
): RegisterPurchaseCommand {
  if (
    !form.productId ||
    form.productId.toLowerCase() !== read.product.id.toLowerCase() ||
    read.product.isArchived
  )
    throw new PurchaseInputError('productId', 'Producto no disponible.');
  const { quantity, unitCost } = parsedForm(form),
    now = Date.now();
  const command = {
    protocolVersion: PROTOCOL_VERSION,
    domainVersion: DOMAIN_VERSION,
    commandKind: 'PURCHASE_REGISTER',
    operationId: v7(),
    occurredAt: now,
    dependsOn: [],
    payload: {
      purchaseId: v7(),
      movementId: v7(),
      productId: read.product.id,
      createdAt: now,
      quantity,
      unitCost: encodeMoney(unitCost.scaledUnits),
      notes: null,
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
    throw new PurchaseInputError('productId', 'Revisa los datos de la compra.');
  return command;
}
export function decodedAnalysis(a: PriceAnalysisDto): PurchasePriceAnalysis {
  return {
    ...a,
    previousUnitCost:
      a.previousUnitCost === null
        ? null
        : Money.fromScaledUnits(decodeMoney(a.previousUnitCost)),
    currentUnitCost: Money.fromScaledUnits(decodeMoney(a.currentUnitCost)),
    regularSalePrice: Money.fromScaledUnits(decodeMoney(a.regularSalePrice)),
    previousMargin:
      a.previousMargin === null
        ? null
        : Percentage.fromScaledUnits(decodePercentage(a.previousMargin)),
    currentMargin:
      a.currentMargin === null
        ? null
        : Percentage.fromScaledUnits(decodePercentage(a.currentMargin)),
    suggestedSalePrice:
      a.suggestedSalePrice === null
        ? null
        : Money.fromScaledUnits(decodeMoney(a.suggestedSalePrice)),
  };
}
export function initialMargin(analysis: PriceAnalysisDto): MarginDraft {
  const value = getInitialPurchaseMargin(decodedAnalysis(analysis));
  return {
    text: value === null ? '' : formatMoney(String(value.scaledUnits)),
    dirty: false,
  };
}
export function desiredMargin(
  analysis: PriceAnalysisDto,
  draft: MarginDraft,
): Percentage | null {
  if (!draft.dirty) return getInitialPurchaseMargin(decodedAnalysis(analysis));
  try {
    const margin = Percentage.fromDecimal(normalizedDecimal(draft.text));
    return margin.scaledUnits < 100_000_000 ? margin : null;
  } catch {
    return null;
  }
}
export function marginPresentation(
  analysis: PriceAnalysisDto,
  draft: MarginDraft,
) {
  const decoded = decodedAnalysis(analysis),
    eligible = canEditPurchaseMargin(decoded.currentUnitCost),
    margin = desiredMargin(analysis, draft),
    recommendation = recommendPurchasePrice(decoded, margin);
  return {
    eligible,
    recommendation,
    error:
      !eligible || draft.text.trim() === ''
        ? null
        : margin === null
          ? 'Ingresa un margen desde 0% y menor que 100%, con hasta seis decimales.'
          : recommendation.status === 'UNAVAILABLE'
            ? 'No podemos calcular un precio para ese margen. Prueba un valor menor.'
            : null,
  };
}
export function priceUpdateDraft(
  result: Pick<RegisterPurchaseCommandResult, 'product' | 'priceAnalysis'>,
  draft: MarginDraft,
) {
  const { recommendation } = marginPresentation(result.priceAnalysis, draft);
  return recommendation.status !== 'PRICE_INCREASE_SUGGESTED'
    ? null
    : initialEditDraft({
        ...result.product,
        regularSalePrice: encodeMoney(
          recommendation.actionableSuggestedPrice.scaledUnits,
        ),
      });
}
