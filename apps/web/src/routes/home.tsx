import { useEffect } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { DashboardDto } from '@stock-app/contracts';
import { useSessionController, useSessionView } from '../auth/context.js';
import { commandScope } from '../commands/scope.js';
import { useOnline } from '../products/context.js';
import { formatMoney } from '../products/input.js';
import { useReads } from '../reads/context.js';
import { dashboardOptions } from '../reads/queries.js';
import { HistoryRow, ReadStatus } from './history.js';

export function DashboardFacts({
  data,
  currency,
  timeZone,
}: {
  data: DashboardDto;
  currency: string;
  timeZone: string;
}) {
  return (
    <>
      <section aria-labelledby="daily-heading">
        <h2 id="daily-heading">Hoy</h2>
        <dl className="dashboard-metrics">
          <dt>Ventas de hoy</dt>
          <dd>
            {formatMoney(data.sales.totalAmount)} {currency}
          </dd>
          <dt>Ganancia estimada</dt>
          <dd>
            {data.sales.estimatedProfit === null
              ? '—'
              : `${formatMoney(data.sales.estimatedProfit)} ${currency}`}
          </dd>
          <dt>Unidades vendidas</dt>
          <dd>{data.sales.unitsSold}</dd>
        </dl>
        {data.sales.estimatedProfit === null && (
          <p>
            La ganancia estimada no está disponible porque una o más ventas
            tienen un costo desconocido.
          </p>
        )}
        {data.sales.unitsSold === 0 && (
          <p>Aún no hay ventas confirmadas hoy.</p>
        )}
      </section>
      <section aria-labelledby="low-heading">
        <h2 id="low-heading">Stock bajo</h2>
        {!data.lowStock.length && <p>No hay productos con stock bajo.</p>}
        <ul className="product-list">
          {data.lowStock.map(({ product, state }) => (
            <li className="sale-history-line" key={product.id}>
              <strong>{product.name}</strong>
              {product.variant && ` · ${product.variant}`}
              <p>Stock: {state.stock}</p>
              {product.minimumStock !== null && (
                <p>Stock mínimo: {product.minimumStock}</p>
              )}
            </li>
          ))}
        </ul>
        <Link to="/products">Ver productos</Link>
      </section>
      <section aria-labelledby="top-heading">
        <h2 id="top-heading">Más vendido hoy</h2>
        {data.topSelling ? (
          <>
            <p>
              <strong>{data.topSelling.name}</strong>
              {data.topSelling.variant && ` · ${data.topSelling.variant}`}
            </p>
            <p>{data.topSelling.unitsSold} unidades vendidas</p>
          </>
        ) : (
          <p>Todavía no hay un producto más vendido hoy.</p>
        )}
      </section>
      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading">Operaciones recientes</h2>
        {!data.recent.length && <p>Aún no hay operaciones registradas.</p>}
        <ol className="product-list">
          {data.recent.map((entry) => (
            <HistoryRow
              key={`${entry.type}/${entry.id.toLowerCase()}`}
              entry={entry}
              currency={currency}
              timeZone={timeZone}
            />
          ))}
        </ol>
        <Link to="/history">Ver historial</Link>
      </section>
    </>
  );
}
export function HomePage() {
  const view = useSessionView(),
    session = useSessionController(),
    scope = commandScope(session);
  if (!scope || view.kind !== 'BUSINESS_ACTIVE_ENABLED' || !view.me.inventory)
    return null;
  return (
    <HomeRead
      key={`${scope.generation}/${scope.businessId}/${scope.inventoryId}`}
      name={view.me.inventory.name}
      timeZone={view.me.inventory.reportingTimeZone}
    />
  );
}
function HomeRead({ name, timeZone }: { name: string; timeZone: string }) {
  const session = useSessionController(),
    scope = commandScope(session)!,
    client = useReads(),
    online = useOnline();
  const query = useQuery(dashboardOptions(client, scope));
  useEffect(() => {
    if (query.error) session.handleBusinessError(query.error);
  }, [session, query.error]);
  return (
    <main className="home-dashboard">
      <h1>Inicio</h1>
      <p>
        {name} · {scope.currency} · Fechas en {timeZone}
      </p>
      <nav aria-label="Acciones principales">
        <Link className="primary-action" to="/sales/new">
          + Venta
        </Link>
        <Link to="/purchases/new">+ Compra</Link>
      </nav>
      <ReadStatus
        error={query.error}
        pending={query.isPending}
        fetching={query.isFetching}
        hasData={!!query.data}
        online={online}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <DashboardFacts
          data={query.data}
          currency={scope.currency}
          timeZone={timeZone}
        />
      )}
      {query.data && (
        <button
          type="button"
          disabled={!online || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Actualizar inicio
        </button>
      )}
    </main>
  );
}
