import { useEffect, type ReactNode } from 'react';
import {
  IconArrowRight,
  IconFileDescription,
  IconPackage,
  IconPlus,
  IconRefresh,
  IconStar,
} from '@tabler/icons-react';
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
  actions,
}: {
  data: DashboardDto;
  currency: string;
  timeZone: string;
  actions?: ReactNode;
}) {
  return (
    <>
      <section className="daily-summary" aria-labelledby="daily-heading">
        <h2 className="sr-only" id="daily-heading">
          Hoy
        </h2>
        <dl className="dashboard-metrics">
          <div>
            <dt>Ventas de hoy</dt>
            <dd>
              {formatMoney(data.sales.totalAmount)} {currency}
            </dd>
          </div>
          <div>
            <dt>Ganancia estimada</dt>
            <dd>
              {data.sales.estimatedProfit === null
                ? '—'
                : `${formatMoney(data.sales.estimatedProfit)} ${currency}`}
            </dd>
          </div>
          <div>
            <dt>Unidades vendidas</dt>
            <dd>{data.sales.unitsSold}</dd>
          </div>
        </dl>
        {data.sales.estimatedProfit === null && (
          <p>
            La ganancia estimada no está disponible porque una o más ventas
            tienen un costo desconocido.
          </p>
        )}
        {data.sales.unitsSold === 0 && (
          <p className="sr-only">Aún no hay ventas confirmadas hoy.</p>
        )}
      </section>
      {actions}
      <div className="dashboard-body">
        <section className="recent-operations" aria-labelledby="recent-heading">
          <div className="section-heading">
            <h2 id="recent-heading">Operaciones recientes</h2>
            <Link to="/history">
              Ver historial <IconArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          {!data.recent.length && (
            <div className="empty-state empty-state-large">
              <IconFileDescription size={128} stroke={1} aria-hidden="true" />
              <p>Aún no hay operaciones registradas.</p>
              <span>
                Aquí se mostrarán tus ventas, compras y ajustes confirmados.
              </span>
            </div>
          )}
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
        </section>
        <div className="dashboard-insights">
          <section aria-labelledby="low-heading">
            <div className="section-heading">
              <h2 id="low-heading">Stock bajo</h2>
              <Link to="/products">
                Ver productos <IconArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
            {!data.lowStock.length && (
              <div className="empty-state empty-state-inline">
                <IconPackage size={34} stroke={1.5} aria-hidden="true" />
                <div>
                  <p>No hay productos con stock bajo.</p>
                  <span>
                    Cuando algún producto llegue a su mínimo, lo verás aquí.
                  </span>
                </div>
              </div>
            )}
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
              <div className="empty-state empty-state-inline">
                <IconStar size={34} stroke={1.5} aria-hidden="true" />
                <div>
                  <p>Todavía no hay un producto más vendido hoy.</p>
                  <span>
                    Las ventas del día mostrarán aquí tu producto destacado.
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
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
  const actions = (
    <nav className="dashboard-actions" aria-label="Acciones principales">
      <div className="action-pair">
        <Link className="primary-action" to="/sales/new">
          <IconPlus size={22} aria-hidden="true" />
          Nueva venta
        </Link>
        <Link className="secondary-action" to="/purchases/new">
          <IconPlus size={22} aria-hidden="true" />
          Nueva compra
        </Link>
      </div>
      {query.data && (
        <button
          className="text-button"
          type="button"
          disabled={!online || query.isFetching}
          onClick={() => void query.refetch()}
        >
          <IconRefresh size={20} aria-hidden="true" />
          Actualizar inicio
        </button>
      )}
    </nav>
  );
  useEffect(() => {
    if (query.error) session.handleBusinessError(query.error);
  }, [session, query.error]);
  return (
    <main className="home-dashboard">
      <h1 className="sr-only">Inicio</h1>
      <p className="sr-only">
        {name} · {scope.currency} · Fechas en {timeZone}
      </p>
      {!query.data && actions}
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
          actions={actions}
        />
      )}
    </main>
  );
}
