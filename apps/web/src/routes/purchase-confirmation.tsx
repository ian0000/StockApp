import { Link } from 'react-router';
import type { PurchaseDto } from '@stock-app/contracts';
import { usePurchases, usePurchaseMutation } from '../purchases/context.js';
import { marginPresentation } from '../purchases/input.js';
import { useOnline, useProductMutation } from '../products/context.js';
import { formatMoney } from '../products/input.js';
import { formatPercentage } from '../products/edit.js';
import { formatSaleTime } from './sales.js';
export function PurchaseFacts({
  purchase: p,
  currency,
  timeZone,
}: {
  purchase: PurchaseDto;
  currency: string;
  timeZone: string;
}) {
  const amount = (value: string | null) =>
    value === null ? 'No disponible' : `${formatMoney(value)} ${currency}`;
  return (
    <section className="sale-detail">
      <h1>{p.status === 'VOIDED' ? 'Compra anulada' : 'Compra registrada'}</h1>
      <p>Estado: {p.status === 'VOIDED' ? 'Anulada' : 'Confirmada'}</p>
      <p>{formatSaleTime(p.effectiveAt, timeZone)}</p>
      <dl>
        <dt>Cantidad</dt>
        <dd>{p.quantity}</dd>
        <dt>Costo de compra por unidad</dt>
        <dd>{amount(p.unitCost)}</dd>
        <dt>Total de compra</dt>
        <dd>{amount(p.totalAmount)}</dd>
        <dt>Stock antes → después</dt>
        <dd>
          {p.stockBefore} → {p.stockAfter}
        </dd>
        <dt>Costo promedio antes</dt>
        <dd>{amount(p.averageCostBefore)}</dd>
        <dt>Costo promedio actual</dt>
        <dd>{amount(p.averageCostAfter)}</dd>
      </dl>
      {p.notes && <p>Notas: {p.notes}</p>}
    </section>
  );
}
export function PurchaseConfirmation({
  currency,
  timeZone,
}: {
  currency: string;
  timeZone: string;
}) {
  const controller = usePurchases(),
    view = usePurchaseMutation(),
    productView = useProductMutation(),
    online = useOnline(),
    c = view.confirmation;
  if (!c) return null;
  const { result, margin, decision } = c,
    { eligible, error, recommendation } = marginPresentation(
      result.priceAnalysis,
      margin,
    ),
    locked = ['saving', 'uncertain'].includes(decision),
    open = decision === 'pending';
  return (
    <>
      <PurchaseFacts
        purchase={result.purchase}
        currency={currency}
        timeZone={timeZone}
      />
      <section aria-label="Precio de venta y margen">
        <h2>Precio de venta y margen</h2>
        <dl>
          <dt>Precio de venta habitual</dt>
          <dd>
            {formatMoney(result.priceAnalysis.regularSalePrice)} {currency}
          </dd>
          <dt>Margen anterior</dt>
          <dd>{formatPercentage(result.priceAnalysis.previousMargin)}</dd>
          <dt>Margen actual</dt>
          <dd>{formatPercentage(result.priceAnalysis.currentMargin)}</dd>
        </dl>
        {eligible && (open || locked) && (
          <>
            <label htmlFor="desired-margin">
              Margen deseado (% del precio de venta)
            </label>
            <input
              id="desired-margin"
              inputMode="decimal"
              value={margin.text}
              disabled={locked}
              onChange={(event) =>
                controller.editMargin(event.currentTarget.value)
              }
              aria-invalid={error !== null}
              aria-describedby="margin-help margin-error"
            />
            <p id="margin-help">
              Indica qué porcentaje del precio de venta quieres que quede como
              margen.
            </p>
            <p id="margin-error" role={error ? 'alert' : undefined}>
              {error}
            </p>
            {recommendation.status === 'CURRENT_PRICE_ALREADY_SUFFICIENT' && (
              <p role="status">
                Tu precio actual ya alcanza o supera el margen deseado. No
                necesitas reducirlo.
              </p>
            )}
            {recommendation.status === 'PRICE_INCREASE_SUGGESTED' && (
              <>
                <p>
                  Precio de venta sugerido:{' '}
                  {formatMoney(
                    String(recommendation.actionableSuggestedPrice.scaledUnits),
                  )}{' '}
                  {currency}
                </p>
                <button
                  type="button"
                  disabled={
                    locked ||
                    !online ||
                    !['READY', 'ERROR'].includes(productView.kind)
                  }
                  onClick={() => void controller.applyPrice()}
                >
                  Actualizar precio de venta a{' '}
                  {formatMoney(
                    String(recommendation.actionableSuggestedPrice.scaledUnits),
                  )}{' '}
                  {currency}
                </button>
              </>
            )}
          </>
        )}
        {(open || decision === 'error' || decision === 'conflict') && (
          <button
            type="button"
            disabled={locked}
            onClick={() => controller.keepPrice()}
          >
            Mantener precio de venta{' '}
            {formatMoney(result.priceAnalysis.regularSalePrice)} {currency}
          </button>
        )}
        <p role="status" aria-live="polite">
          {c.priceMessage}
        </p>
        {decision === 'uncertain' && (
          <>
            <button
              type="button"
              disabled={!online}
              onClick={() => void controller.products.retry()}
            >
              Reintentar cambio de precio
            </button>
            <button
              type="button"
              disabled={!online}
              onClick={() => void controller.products.check()}
            >
              Comprobar cambio de precio
            </button>
            <button type="button" onClick={() => controller.discardPrice()}>
              Descartar cambio de precio pendiente
            </button>
          </>
        )}
        {!locked && !['READY', 'ERROR'].includes(productView.kind) && open && (
          <p>
            Resuelve el cambio de producto pendiente antes de actualizar el
            precio. <Link to="/products">Ir a productos</Link>
          </p>
        )}
        {(decision === 'conflict' || decision === 'error') && (
          <Link to={`/products/${result.product.id}`}>Ver producto</Link>
        )}
      </section>
      <nav aria-label="Después de la compra">
        <Link to={`/purchases/${result.purchase.id}`}>
          Ver detalle de compra
        </Link>
        <Link to="/products">Volver a productos</Link>
        <button
          type="button"
          disabled={locked}
          onClick={() => controller.leaveConfirmation()}
        >
          Nueva compra
        </button>
      </nav>
    </>
  );
}
