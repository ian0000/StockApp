import { Link, isRouteErrorResponse, useRouteError } from 'react-router';

export function LoadingPage() {
  return (
    <main role="status" aria-live="polite">
      <h1>Cargando…</h1>
      <p>Estamos preparando la página.</p>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main>
      <h1>Página no encontrada</h1>
      <p>Revisa la dirección o vuelve al inicio.</p>
      <Link to="/">Volver al inicio</Link>
    </main>
  );
}

export function RouteErrorPage() {
  const error: unknown = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404)
    return <NotFoundPage />;
  return (
    <main>
      <h1>No pudimos abrir esta página</h1>
      <p>Vuelve al inicio e inténtalo de nuevo.</p>
      <Link to="/">Volver al inicio</Link>
    </main>
  );
}
