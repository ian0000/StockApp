import { useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { useOnline } from '../products/context.js';
import { formatMoney } from '../products/input.js';
import { VoidsContext } from './context.js';
import { operation, eligibilityMessage, type VoidDetail } from './input.js';
import { resultId } from './client.js';
import type { VoidController } from './controller.js';

export function VoidAction({
  read,
  currency,
}: {
  read: VoidDetail;
  currency: string;
}) {
  const controllers = useContext(VoidsContext);
  if (!controllers) return null;
  return (
    <VoidPanel
      read={read}
      currency={currency}
      controller={
        read.commandKind === 'SALE_VOID'
          ? controllers.sale
          : controllers.purchase
      }
    />
  );
}
export function VoidPanel({
  read,
  currency,
  controller,
}: {
  read: VoidDetail;
  currency: string;
  controller: VoidController;
}) {
  const view = useSyncExternalStore(
      controller.subscribe,
      controller.snapshot,
      controller.snapshot,
    ),
    online = useOnline(),
    alert = useRef<HTMLParagraphElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    target = operation(read),
    sale = read.commandKind === 'SALE_VOID',
    eligible =
      target.status === 'CONFIRMED' &&
      read.detail.voidEligibility.eligible &&
      !(
        view.kind === 'ACCEPTED' &&
        view.result &&
        resultId(view.result).toLowerCase() === target.id.toLowerCase()
      );
  useEffect(() => {
    if (view.kind === 'ERROR' || view.kind === 'CONFLICT')
      alert.current?.focus();
    else if (view.kind === 'WARNING') heading.current?.focus();
  }, [view]);
  const waiting = ['SENDING', 'PREPARING', 'CHECKING'].includes(view.kind);
  return (
    <section aria-label={sale ? 'Anulación de venta' : 'Anulación de compra'}>
      {!eligible && <p role="status">{eligibilityMessage(read)}</p>}
      {waiting && <p role="status">{view.message}</p>}
      {(view.kind === 'ERROR' || view.kind === 'CONFLICT') && (
        <p ref={alert} role="alert" tabIndex={-1}>
          {view.message}
        </p>
      )}
      {view.kind === 'ACCEPTED' && (
        <p role="status">
          {view.message}{' '}
          {view.result &&
            resultId(view.result).toLowerCase() !== target.id.toLowerCase() && (
              <Link
                to={`/${sale ? 'sales' : 'purchases'}/${resultId(view.result)}`}
              >
                Ver operación anulada
              </Link>
            )}
        </p>
      )}
      {view.kind === 'UNCERTAIN' && (
        <div>
          <p role="status">{view.message}</p>
          {view.canRetry && (
            <button
              type="button"
              disabled={!online}
              onClick={() => void controller.retry()}
            >
              Reintentar el mismo envío
            </button>
          )}
          <button
            type="button"
            disabled={!online}
            onClick={() => void controller.check()}
          >
            Comprobar nuevamente
          </button>
          <button type="button" onClick={() => controller.discard()}>
            Descartar intención anterior
          </button>
          <p>
            Descartar no revierte una anulación que el servidor ya haya
            registrado.
          </p>
        </div>
      )}
      {view.kind === 'WARNING' && view.review && (
        <div role="group" aria-label="Confirmación de anulación">
          <h2 ref={heading} tabIndex={-1}>
            {sale ? '¿Anular esta venta?' : '¿Anular esta compra?'}
          </h2>
          <p>
            Se restaurarán los efectos de inventario de la operación. El
            registro histórico seguirá visible como anulado; no se elimina. No
            necesitas indicar un motivo.
          </p>
          <p>{view.message}</p>
          <p>
            Total original: {formatMoney(operation(view.review).totalAmount)}{' '}
            {currency}
          </p>
          {sale && <p>Se anulará la venta completa con todos sus productos.</p>}
          <button type="button" onClick={() => controller.cancel()}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!online || !eligible}
            onClick={() => void controller.confirm()}
          >
            Confirmar anulación
          </button>
        </div>
      )}
      {eligible &&
        !waiting &&
        !['WARNING', 'UNCERTAIN'].includes(view.kind) && (
          <button
            type="button"
            disabled={!online}
            onClick={() => {
              if (view.kind === 'ACCEPTED') controller.acknowledge();
              void controller.prepare(target.id);
            }}
          >
            {sale ? 'Anular venta' : 'Anular compra'}
          </button>
        )}
    </section>
  );
}
