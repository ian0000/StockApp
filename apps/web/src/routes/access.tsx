import { Navigate, NavLink, Outlet } from 'react-router';
import { useSessionController, useSessionView } from '../auth/context.js';
import { LoadingPage } from './status.js';
import { privateDestination } from '../auth/session.js';

export function LogoutButton() {
  const controller = useSessionController();
  return (
    <button
      type="button"
      onClick={() => {
        void controller.logout();
      }}
    >
      Cerrar sesión
    </button>
  );
}
export function AccessStatus() {
  const view = useSessionView();
  const controller = useSessionController();
  if (
    ['LOADING_SESSION', 'AUTHENTICATED_LOADING_ME', 'LOGGING_OUT'].includes(
      view.kind,
    )
  )
    return <LoadingPage />;
  const titles: Partial<Record<typeof view.kind, string>> = {
    BUSINESS_ACTIVE_DISABLED: 'Acceso cloud pendiente',
    BUSINESS_DELETING: 'Tu cuenta está en proceso de eliminación.',
    BUSINESS_WITHOUT_INVENTORY: 'Configuración pendiente',
    ERROR: 'No pudimos comprobar tu acceso',
    LOGOUT_ERROR: 'No pudimos cerrar la sesión',
  };
  return (
    <main>
      <h1>
        {'cloudDisabled' in view && view.cloudDisabled
          ? 'Acceso cloud pendiente'
          : (titles[view.kind] ?? 'Acceso a tu cuenta')}
      </h1>
      {'me' in view && <p>Cuenta: {view.me.user.email}</p>}
      {view.kind === 'BUSINESS_ACTIVE_DISABLED' && (
        <p>
          Tu acceso cloud aún no está habilitado. Puedes volver a comprobarlo
          más adelante.
        </p>
      )}
      {view.kind === 'BUSINESS_WITHOUT_INVENTORY' && (
        <p>
          Tu cuenta tiene una configuración pendiente o reservada. No crearemos
          otro inventario automáticamente.
        </p>
      )}
      {'message' in view && <p role="alert">{view.message}</p>}
      {'verification' in view && view.verification && (
        <NavLink to="/verify-email">Verificar correo</NavLink>
      )}
      {view.kind !== 'LOGOUT_ERROR' && (
        <button
          type="button"
          onClick={() => {
            void controller.refresh();
          }}
        >
          Refrescar estado
        </button>
      )}
      <LogoutButton />
    </main>
  );
}
export function PrivateBoundary() {
  const view = useSessionView();
  const destination = privateDestination(view);
  if (destination) return <Navigate to={destination} replace />;
  if (view.kind !== 'BUSINESS_ACTIVE_ENABLED') return <AccessStatus />;
  return <AppShell />;
}
export function AppShell() {
  const view = useSessionView();
  if (view.kind !== 'BUSINESS_ACTIVE_ENABLED') return <AccessStatus />;
  return (
    <div className="app-shell" key={view.generation}>
      <a className="skip-link" href="#app-content">
        Ir al contenido
      </a>
      <aside>
        <p>Cuenta: {view.me.user.email}</p>
        <nav aria-label="Navegación principal">
          <NavLink to="/" end>
            Inicio
          </NavLink>
          <NavLink to="/products">Productos</NavLink>
          <NavLink to="/history">Historial</NavLink>
          <NavLink to="/settings">Configuración</NavLink>
        </nav>
        <nav aria-label="Registrar operación">
          <NavLink to="/sales/new">Nueva venta</NavLink>
          <NavLink to="/purchases/new">Nueva compra</NavLink>
        </nav>
        <LogoutButton />
      </aside>
      <div id="app-content" tabIndex={-1}>
        <Outlet />
      </div>
    </div>
  );
}
export function HomePage() {
  const view = useSessionView();
  if (view.kind !== 'BUSINESS_ACTIVE_ENABLED' || !view.me.inventory)
    return <AccessStatus />;
  const inventory = view.me.inventory;
  return (
    <main>
      <h1>Inventario conectado</h1>
      <p>{inventory.name}</p>
      <dl>
        <dt>Moneda</dt>
        <dd>{inventory.currency}</dd>
        <dt>Zona de reportes</dt>
        <dd>{inventory.reportingTimeZone}</dd>
      </dl>
      <p>Las pantallas comerciales se incorporarán por etapas.</p>
    </main>
  );
}
