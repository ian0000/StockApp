import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import {
  IconHome,
  IconCube,
  IconFileText,
  IconSettings,
  IconPlus,
  IconShoppingBag,
  IconCalendar,
  IconLogout,
} from '@tabler/icons-react';
import { Brand } from '../ui/brand.js';
import { useSessionController, useSessionView } from '../auth/context.js';
import { LoadingPage } from './status.js';
import { privateDestination } from '../auth/session.js';
import { LandingPage } from './landing.js';

export function LogoutButton() {
  const controller = useSessionController();
  return (
    <button
      className="logout-button"
      type="button"
      onClick={() => {
        void controller.logout();
      }}
    >
      <IconLogout size={19} aria-hidden="true" />
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
      {'me' in view && view.me.user.emailVerified && (
        <NavLink to="/settings/privacy">Datos y privacidad</NavLink>
      )}
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
  const location = useLocation();
  if (view.kind === 'ANONYMOUS' && location.pathname === '/')
    return <LandingPage />;
  const destination = privateDestination(view);
  if (destination) return <Navigate to={destination} replace />;
  if (view.kind !== 'BUSINESS_ACTIVE_ENABLED') return <AccessStatus />;
  return <AppShell />;
}
export function AppShell() {
  const view = useSessionView();
  const location = useLocation();
  if (view.kind !== 'BUSINESS_ACTIVE_ENABLED') return <AccessStatus />;
  const page = location.pathname.startsWith('/products')
    ? 'Productos'
    : location.pathname.startsWith('/history')
      ? 'Historial'
      : location.pathname.startsWith('/settings')
        ? 'Configuración'
        : location.pathname.startsWith('/sales')
          ? 'Ventas'
          : location.pathname.startsWith('/purchases')
            ? 'Compras'
            : location.pathname.startsWith('/adjustments')
              ? 'Ajuste de stock'
              : 'Inicio';
  const timeZone = view.me.inventory?.reportingTimeZone ?? 'UTC';
  const date = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(new Date());
  return (
    <div className="app-shell" key={view.generation}>
      <a className="skip-link" href="#app-content">
        Ir al contenido
      </a>
      <aside className="app-sidebar">
        <NavLink className="brand-link" to="/" aria-label="StockApp · Inicio">
          <Brand />
        </NavLink>
        <nav aria-label="Navegación principal">
          <NavLink to="/" end>
            <IconHome size={23} aria-hidden="true" />
            Inicio
          </NavLink>
          <NavLink to="/products">
            <IconCube size={23} aria-hidden="true" />
            Productos
          </NavLink>
          <NavLink to="/history">
            <IconFileText size={23} aria-hidden="true" />
            Historial
          </NavLink>
          <NavLink to="/settings">
            <IconSettings size={23} aria-hidden="true" />
            Configuración
          </NavLink>
        </nav>
        <span className="nav-caption">Registrar operación</span>
        <nav aria-label="Registrar operación">
          <NavLink to="/sales/new">
            <IconPlus size={20} aria-hidden="true" />
            Nueva venta
          </NavLink>
          <NavLink to="/purchases/new">
            <IconShoppingBag size={20} aria-hidden="true" />
            Nueva compra
          </NavLink>
        </nav>
        <div className="sidebar-account">
          <span className="nav-caption">Tu cuenta</span>
          <p>{view.me.user.email}</p>
          <LogoutButton />
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <div>
            <strong>
              {view.me.inventory?.name}{' '}
              <span className="inventory-currency">
                · {view.me.inventory?.currency}
              </span>
            </strong>
            <span className="workspace-section">{page}</span>
          </div>
          <div className="workspace-date">
            <IconCalendar size={23} aria-hidden="true" />
            <div>
              <span>{date}</span>
              <small>{timeZone}</small>
            </div>
          </div>
        </header>
        <div id="app-content" tabIndex={-1}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
