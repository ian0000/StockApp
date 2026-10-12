import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { HistoryEntryDto } from '@stock-app/contracts';
import { useSessionController, useSessionView } from '../auth/context.js';
import { useOnline } from '../products/context.js';
import { commandScope } from '../commands/scope.js';
import { formatMoney } from '../products/input.js';
import { reasonLabel, signedDifference } from '../adjustments/input.js';
import { formatSaleTime } from './sales.js';
import { ApiClientError } from '../api/client.js';
import { useReads } from '../reads/context.js';
import { uniqueHistory } from '../reads/client.js';
import { historyOptions } from '../reads/queries.js';
import { historyGroups } from '../reads/presentation.js';

export function readErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401)
      return 'Tu sesión caducó. Vuelve a iniciar sesión.';
    if (error.status === 403 || error.status === 404)
      return 'No pudimos consultar este inventario. Comprueba tu acceso.';
    if (error.status === 400)
      return 'No pudimos cargar esta página. Actualiza el historial para comenzar de nuevo.';
    if (error.status === 429)
      return 'Demasiadas consultas. Espera un momento y reintenta.';
  }
  return 'No pudimos cargar los datos. Vuelve a intentarlo.';
}
export function ReadStatus({
  error,
  pending,
  fetching,
  hasData,
  online,
  retry,
}: {
  error: unknown;
  pending: boolean;
  fetching: boolean;
  hasData: boolean;
  online: boolean;
  retry: () => void;
}) {
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);
  return (
    <>
      {!online && (
        <p role="status">
          Sin conexión.{' '}
          {hasData
            ? 'Los datos en pantalla pueden estar desactualizados.'
            : 'Necesitas conexión para consultar los datos.'}
        </p>
      )}
      {pending && online && !error && <p role="status">Cargando datos…</p>}
      {fetching && hasData && <p role="status">Actualizando datos…</p>}
      {!!error && (
        <div>
          <p role="alert" tabIndex={-1} ref={alert}>
            {readErrorMessage(error)}
            {hasData && ' Los datos anteriores pueden estar desactualizados.'}
          </p>
          <button type="button" disabled={!online || fetching} onClick={retry}>
            Reintentar consulta
          </button>
        </div>
      )}
    </>
  );
}
export function HistoryRow({
  entry,
  currency,
  timeZone,
}: {
  entry: HistoryEntryDto;
  currency: string;
  timeZone: string;
}) {
  const label =
    entry.type === 'SALE'
      ? entry.status === 'VOIDED'
        ? 'Venta anulada'
        : 'Venta'
      : entry.type === 'PURCHASE'
        ? entry.status === 'VOIDED'
          ? 'Compra anulada'
          : 'Compra'
        : 'Ajuste';
  return (
    <li className="sale-history-line">
      <h3>
        {entry.type === 'ADJUSTMENT' ? (
          label
        ) : (
          <Link
            to={`/${entry.type === 'SALE' ? 'sales' : 'purchases'}/${entry.id}`}
          >
            {label}
          </Link>
        )}
      </h3>
      {entry.type !== 'SALE' && (
        <p>
          <strong>{entry.productName}</strong>
          {entry.productVariant && ` · ${entry.productVariant}`}
        </p>
      )}
      {entry.type === 'SALE' && (
        <p>
          Total: {formatMoney(entry.totalAmount)} {currency} · {entry.units}{' '}
          unidades
        </p>
      )}
      {entry.type === 'PURCHASE' && (
        <>
          <p>
            {entry.quantity} unidades · Costo por unidad:{' '}
            {formatMoney(entry.unitCost)} {currency}
          </p>
          <p>
            Total: {formatMoney(entry.totalAmount)} {currency}
          </p>
        </>
      )}
      {entry.type === 'ADJUSTMENT' && (
        <p>
          Diferencia: {signedDifference(entry.difference)} ·{' '}
          {reasonLabel(entry.reason)}
        </p>
      )}
      {entry.type !== 'ADJUSTMENT' && (
        <p>Estado: {entry.status === 'VOIDED' ? 'Anulada' : 'Confirmada'}</p>
      )}
      <p>
        <time
          dateTime={
            Number.isFinite(new Date(entry.effectiveAt).valueOf())
              ? new Date(entry.effectiveAt).toISOString()
              : undefined
          }
        >
          {formatSaleTime(entry.effectiveAt, timeZone)}
        </time>
      </p>
    </li>
  );
}
export function HistoryList({
  entries,
  currency,
  timeZone,
  now = Date.now(),
}: {
  entries: readonly HistoryEntryDto[];
  currency: string;
  timeZone: string;
  now?: number;
}) {
  return (
    <>
      {historyGroups(entries, timeZone, now).map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h2>{group.label}</h2>
          <ol className="product-list">
            {group.items.map((entry) => (
              <HistoryRow
                key={`${entry.type}/${entry.id.toLowerCase()}`}
                entry={entry}
                currency={currency}
                timeZone={timeZone}
              />
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
export function HistoryPage() {
  const view = useSessionView(),
    session = useSessionController(),
    scope = commandScope(session);
  if (!scope || view.kind !== 'BUSINESS_ACTIVE_ENABLED' || !view.me.inventory)
    return null;
  return (
    <HistoryRead
      key={`${scope.generation}/${scope.businessId}/${scope.inventoryId}`}
      timeZone={view.me.inventory.reportingTimeZone}
    />
  );
}
function HistoryRead({ timeZone }: { timeZone: string }) {
  const session = useSessionController(),
    scope = commandScope(session)!,
    client = useReads(),
    online = useOnline();
  const query = useInfiniteQuery(historyOptions(client, scope));
  useEffect(() => {
    if (query.error) session.handleBusinessError(query.error);
  }, [session, query.error]);
  const entries = query.data ? uniqueHistory(query.data.pages) : [];
  return (
    <main>
      <h1>Historial</h1>
      <p>Fechas en {timeZone}.</p>
      <ReadStatus
        error={query.error}
        pending={query.isPending}
        fetching={query.isFetching}
        hasData={!!query.data}
        online={online}
        retry={() => void query.refetch()}
      />
      {query.data && !entries.length && (
        <p>Aún no hay ventas, compras ni ajustes registrados.</p>
      )}
      <HistoryList
        entries={entries}
        currency={scope.currency}
        timeZone={timeZone}
      />
      {query.hasNextPage && (
        <button
          type="button"
          disabled={!online || query.isFetching || !!query.error}
          onClick={() => void query.fetchNextPage()}
        >
          Cargar más
        </button>
      )}
      {query.data && (
        <button
          type="button"
          disabled={!online || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Actualizar historial
        </button>
      )}
    </main>
  );
}
