import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { useSessionController, useSessionView } from '../auth/context.js';
import type { AccessState, SessionView } from '../auth/session.js';
import type { MeResponse } from '@stock-app/contracts';
import { AccessStatus, LogoutButton } from './access.js';
import {
  AccountMetadataContext,
  useAccountController,
  useAccountMetadata,
  useAccountView,
} from '../account/context.js';
import { useOnline } from '../products/context.js';
import {
  IconArrowLeft,
  IconSettings,
  IconShieldLock,
} from '@tabler/icons-react';
import { Brand } from '../ui/brand.js';

export const legalLinks = [
  ['Política de privacidad', 'https://ian-k.dev/stockapp/privacy/'],
  ['Términos de uso', 'https://ian-k.dev/stockapp/terms/'],
  ['Soporte', 'https://ian-k.dev/stockapp/support/'],
] as const;
function LegalSupport() {
  return (
    <section aria-labelledby="legal-title">
      <h2 id="legal-title">Legal y soporte</h2>
      <nav aria-label="Legal y soporte">
        {legalLinks.map(([label, url]) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            {label}
          </a>
        ))}
      </nav>
    </section>
  );
}
export function DeletionOutcomePage() {
  const state = useAccountView();
  return (
    <main>
      <h1>
        {state.kind === 'ACCEPTED'
          ? 'Eliminación solicitada'
          : 'Solicitud sin confirmar'}
      </h1>
      <p role="status" aria-live="polite">
        {state.message}
      </p>
      <p>
        Si tu cuenta todavía existe, puedes iniciar sesión y solicitar la
        eliminación nuevamente de forma consciente. No realizaremos otra
        solicitud automáticamente.
      </p>
      <Link to="/login">Iniciar sesión</Link>
      <LegalSupport />
    </main>
  );
}
type AccountMetadata = {
  generation: number;
  me: MeResponse;
  kind: AccessState;
};
export function retainedAccountMetadata(
  view: SessionView,
  previous: AccountMetadata | null,
): AccountMetadata | null {
  if ('me' in view && view.me.user.emailVerified)
    return { generation: view.generation, me: view.me, kind: view.kind };
  return previous?.generation === view.generation &&
    ['LOADING_SESSION', 'AUTHENTICATED_LOADING_ME'].includes(view.kind)
    ? previous
    : null;
}
export function AccountBoundary() {
  const view = useSessionView(),
    state = useAccountView(),
    location = useLocation();
  const last = useRef<AccountMetadata | null>(null);
  const meta = (last.current = retainedAccountMetadata(view, last.current));
  if (!meta) {
    if ('me' in view && !view.me.user.emailVerified)
      return (
        <main>
          <h1>Verifica tu correo</h1>
          <p>Verifica tu correo para acceder a los datos de tu cuenta.</p>
          <Link to="/verify-email">Verificar correo</Link>
          <LogoutButton />
        </main>
      );
    if (
      location.pathname === '/settings/privacy' &&
      ['ACCEPTED', 'UNKNOWN'].includes(state.kind)
    )
      return <DeletionOutcomePage />;
    if (view.kind === 'ANONYMOUS') return <Navigate to="/login" replace />;
    return <AccessStatus />;
  }
  return (
    <AccountMetadataContext.Provider value={meta}>
      <div className="app-shell" key={meta.generation}>
        <a className="skip-link" href="#app-content">
          Ir al contenido
        </a>
        <aside className="app-sidebar">
          <Link
            className="brand-link"
            to={meta.kind === 'NO_BUSINESS' ? '/onboarding' : '/'}
          >
            <Brand />
          </Link>
          <nav aria-label="Navegación de cuenta">
            <Link to={meta.kind === 'NO_BUSINESS' ? '/onboarding' : '/'}>
              <IconArrowLeft size={22} aria-hidden="true" />
              Volver a la aplicación
            </Link>
            <Link to="/settings">
              <IconSettings size={22} aria-hidden="true" />
              Configuración
            </Link>
            <Link to="/settings/privacy">
              <IconShieldLock size={22} aria-hidden="true" />
              Datos y privacidad
            </Link>
          </nav>
          <div className="sidebar-account">
            <span className="nav-caption">Tu cuenta</span>
            <p>{meta.me.user.email}</p>
            <LogoutButton />
          </div>
        </aside>
        <div className="workspace">
          <header className="workspace-header">
            <div>
              <strong>Tu cuenta</strong>
              <span className="workspace-section">
                {location.pathname === '/settings/privacy'
                  ? 'Datos y privacidad'
                  : 'Configuración'}
              </span>
            </div>
          </header>
          <div id="app-content" tabIndex={-1}>
            <Outlet />
          </div>
        </div>
      </div>
    </AccountMetadataContext.Provider>
  );
}
function AccountStatus() {
  const state = useAccountView(),
    ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.message) ref.current?.focus();
  }, [state.message]);
  return (
    <p ref={ref} tabIndex={-1} role="status" aria-live="polite">
      {state.message}
    </p>
  );
}
export function SettingsPage() {
  const { me } = useAccountMetadata();
  const online = useOnline();
  return (
    <main>
      <h1>Configuración</h1>
      {!online && (
        <p role="status">
          Sin conexión. Los datos visibles pueden estar desactualizados.
        </p>
      )}
      <dl>
        <dt>Correo de la cuenta</dt>
        <dd>{me.user.email}</dd>
        {me.inventory ? (
          <>
            <dt>Inventario</dt>
            <dd>{me.inventory.name}</dd>
            <dt>Moneda</dt>
            <dd>{me.inventory.currency}</dd>
            <dt>Zona de reportes</dt>
            <dd>{me.inventory.reportingTimeZone}</dd>
          </>
        ) : (
          <>
            <dt>Inventario</dt>
            <dd>No hay un inventario disponible.</dd>
          </>
        )}
      </dl>
      <p>
        La moneda y la zona de reportes son valores de consulta en esta versión.
      </p>
      <section>
        <h2>Datos y privacidad</h2>
        <nav aria-label="Datos de tu cuenta">
          <Link to="/settings/privacy">Datos y privacidad</Link>
          <Link to="/settings/privacy#backup">Descargar respaldo</Link>
          <Link to="/settings/privacy#export">Exportar mi cuenta</Link>
          <Link to="/settings/privacy#deletion">Eliminar mi cuenta</Link>
        </nav>
      </section>
      <LegalSupport />
    </main>
  );
}
export function PrivacyPage() {
  const { kind } = useAccountMetadata(),
    controller = useAccountController(),
    state = useAccountView(),
    online = useOnline();
  const confirm = useRef<HTMLHeadingElement>(null),
    busy = ['BACKUP', 'EXPORT', 'DELETING', 'REAUTHENTICATING'].includes(
      state.kind,
    );
  useEffect(() => {
    if (state.kind === 'REVIEW') confirm.current?.focus();
  }, [state.kind]);
  const uncertain = state.kind === 'UNKNOWN',
    blocked = busy || uncertain || state.kind === 'REVIEW' || !online;
  return (
    <main>
      <h1>Datos y privacidad</h1>
      {!online && (
        <p role="status">
          Sin conexión. Los datos visibles pueden estar desactualizados.
          Conéctate para descargar, autenticarte o solicitar una eliminación.
        </p>
      )}
      {kind === 'BUSINESS_DELETING' && (
        <p>
          Tu cuenta está en proceso de eliminación. La exportación y las
          operaciones de inventario no están disponibles. Si necesitas repetir
          la solicitud, vuelve a iniciar sesión y confírmala nuevamente.
        </p>
      )}
      <section id="backup">
        <h2>Respaldo del inventario</h2>
        <p>
          El respaldo contiene información de tu negocio. Guárdalo en un lugar
          seguro. Incluye los datos comerciales y el historial; el archivo JSON
          no está cifrado.
        </p>
        {kind === 'BUSINESS_ACTIVE_ENABLED' ? (
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              void controller.download('BACKUP');
            }}
          >
            Descargar respaldo
          </button>
        ) : (
          <p>
            El respaldo requiere un inventario activo propio con acceso cloud
            habilitado.
          </p>
        )}
      </section>
      <section id="export">
        <h2>Exportar mi cuenta</h2>
        <p>
          Incluye la información de tu cuenta y el respaldo de inventario cuando
          existe. Si no hay inventario, incluye solo la información de tu
          cuenta. No es un reporte CSV/Excel, una sincronización ni una
          restauración cloud.
        </p>
        {kind !== 'BUSINESS_DELETING' && (
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              void controller.download('EXPORT');
            }}
          >
            Exportar mi cuenta
          </button>
        )}
        <p>No se ofrece importar ni restaurar estos archivos en Cloud.</p>
      </section>
      <AccountStatus />
      {state.kind === 'REAUTH_REQUIRED' && (
        <Link to="/settings/reauthenticate">
          Volver a iniciar sesión para continuar
        </Link>
      )}
      {uncertain && (
        <>
          <p>Una sesión cerrada no demuestra que la solicitud haya fallado.</p>
          {state.canRetry && (
            <button
              type="button"
              disabled={!online}
              onClick={() => {
                void controller.retryDeletion();
              }}
            >
              Reintentar la misma solicitud
            </button>
          )}
          <Link to="/settings/reauthenticate">Volver a iniciar sesión</Link>
        </>
      )}
      <section id="deletion" className="account-deletion">
        <h2>Eliminar mi cuenta</h2>
        <p>
          Esta acción es irreversible. Se programará la eliminación de tu cuenta
          y datos cloud. Se revocarán tus sesiones y se interrumpirá el acceso.
          La eliminación del historial continuará en el servidor; no prometemos
          una purga instantánea.
        </p>
        <p>
          Las copias que hayas descargado no pueden eliminarse remotamente. Las
          copias de recuperación siguen los procedimientos documentados de
          eliminación y supresión al restaurar.
        </p>
        {state.kind === 'REVIEW' ? (
          <div role="group" aria-labelledby="deletion-confirm-title">
            <h3 id="deletion-confirm-title" ref={confirm} tabIndex={-1}>
              ¿Solicitar la eliminación irreversible de tu cuenta y datos cloud?
            </h3>
            <button type="button" onClick={() => controller.cancel()}>
              Cancelar
            </button>
            <button
              className="danger"
              type="button"
              disabled={!online || busy}
              onClick={() => {
                void controller.confirmDeletion();
              }}
            >
              Solicitar eliminación de mi cuenta
            </button>
          </div>
        ) : (
          <button
            className="danger"
            type="button"
            disabled={blocked || state.kind === 'ACCEPTED'}
            onClick={() => controller.reviewDeletion()}
          >
            Eliminar mi cuenta
          </button>
        )}
      </section>
      <LegalSupport />
    </main>
  );
}
// Public during the official login boundary, but it exposes no private dataset or action.
export function ReauthenticatePage() {
  const session = useSessionController(),
    view = useSessionView(),
    controller = useAccountController(),
    state = useAccountView(),
    online = useOnline();
  const [password, setPassword] = useState(''),
    [pending, setPending] = useState(false),
    flight = useRef(false);
  const currentEmail =
    'me' in view && view.me.user.emailVerified ? view.me.user.email : null;
  const generation = useRef(view.generation);
  useEffect(() => {
    if (generation.current !== view.generation) {
      generation.current = view.generation;
      setPassword('');
    }
  }, [view.generation]);
  return (
    <main>
      <h1>Volver a iniciar sesión</h1>
      <p>
        Por seguridad, inicia una nueva sesión oficial en la misma cuenta.
        Después tendrás que iniciar y confirmar nuevamente la acción. No
        repetiremos ninguna descarga ni eliminación automáticamente.
      </p>
      {currentEmail && <p>Cuenta: {currentEmail}</p>}
      {!online && <p>Sin conexión. Conéctate para iniciar sesión.</p>}
      {currentEmail ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (flight.current || !online) return;
            flight.current = true;
            setPending(true);
            const input = password;
            setPassword('');
            void controller.reauthenticate(input).finally(() => {
              flight.current = false;
              setPending(false);
            });
          }}
        >
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button type="submit" disabled={pending || !online}>
            Iniciar nueva sesión
          </button>
        </form>
      ) : pending ? (
        <p role="status">Comprobando nueva sesión…</p>
      ) : (
        <Link to="/login">Iniciar sesión</Link>
      )}
      <AccountStatus />
      {'me' in view && (
        <Link to="/settings/privacy">Volver a datos y privacidad</Link>
      )}
      {view.kind === 'LOGOUT_ERROR' && (
        <button
          type="button"
          onClick={() => {
            void session.logout();
          }}
        >
          Reintentar cerrar sesión
        </button>
      )}
      {state.kind === 'ERROR' && (
        <p>
          Vuelve a iniciar la acción únicamente después de comprobar tu cuenta.
        </p>
      )}
    </main>
  );
}
